import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { MAX_CUSTOM_PAYMENT_METHODS, paymentMethodNameKey, type PaymentMethodKind } from './payment-methods.constants.js';

export type PublicPaymentMethod = {
  id: number;
  kind: PaymentMethodKind;
  name: string;
  /** Pode ser escolhida em despesas novas? A "Não informada" não pode (RN-70). */
  selectable: boolean;
  /** Pode ser renomeada e excluída? Só as personalizadas (RN-68, RN-69). */
  custom: boolean;
};

/** Ordem de exibição: as padrão na ordem de RN-68, depois as personalizadas, e a "Não informada" por último. */
const ORDER: PaymentMethodKind[] = ['PIX', 'DEBIT', 'CREDIT', 'CASH', 'BOLETO', 'CUSTOM', 'UNSPECIFIED'];

function toPublic(method: { id: number; kind: string; name: string }): PublicPaymentMethod {
  const kind = method.kind as PaymentMethodKind;
  return { id: method.id, kind, name: method.name, selectable: kind !== 'UNSPECIFIED', custom: kind === 'CUSTOM' };
}

const nameInUse = () =>
  new AppError(409, 'PAYMENT_METHOD_NAME_IN_USE', 'Já existe uma forma de pagamento com este nome.', [
    { path: 'name', message: 'Já existe uma forma de pagamento com este nome.' },
  ]);

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Busca uma forma do usuário; de outro usuário responde como inexistente (RN-04). */
export async function findOwnedPaymentMethod(userId: number, id: number) {
  const method = await prisma.paymentMethod.findFirst({ where: { id, userId } });
  if (!method) throw new AppError(404, 'PAYMENT_METHOD_NOT_FOUND', 'Forma de pagamento não encontrada.');
  return method;
}

async function findCustom(userId: number, id: number) {
  const method = await findOwnedPaymentMethod(userId, id);
  if (method.kind !== 'CUSTOM') {
    throw new AppError(400, 'DEFAULT_PAYMENT_METHOD', 'As formas padrão não podem ser renomeadas nem excluídas.');
  }
  return method;
}

export async function listPaymentMethods(userId: number): Promise<PublicPaymentMethod[]> {
  const methods = await prisma.paymentMethod.findMany({ where: { userId } });
  return methods
    .map(toPublic)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

/** RN-69 */
export async function createPaymentMethod(userId: number, name: string): Promise<PublicPaymentMethod> {
  const count = await prisma.paymentMethod.count({ where: { userId, kind: 'CUSTOM' } });
  if (count >= MAX_CUSTOM_PAYMENT_METHODS) {
    throw new AppError(
      409,
      'PAYMENT_METHOD_LIMIT_REACHED',
      `Você já tem ${MAX_CUSTOM_PAYMENT_METHODS} formas de pagamento personalizadas, que é o máximo.`,
    );
  }
  try {
    return toPublic(await prisma.paymentMethod.create({ data: { userId, kind: 'CUSTOM', name, nameKey: paymentMethodNameKey(name) } }));
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
}

/** RN-69: só as personalizadas podem ser renomeadas. */
export async function renamePaymentMethod(userId: number, id: number, name: string): Promise<PublicPaymentMethod> {
  await findCustom(userId, id);
  try {
    return toPublic(await prisma.paymentMethod.update({ where: { id }, data: { name, nameKey: paymentMethodNameKey(name) } }));
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
}

/**
 * RN-69: exclui uma forma personalizada. Se tiver lançamentos, eles vão para `moveTo`,
 * que não pode ser Crédito (exigiria um cartão) nem a "Não informada". Tudo numa transação.
 */
export async function deletePaymentMethod(userId: number, id: number, moveTo: number | undefined): Promise<void> {
  await findCustom(userId, id);
  await prisma.$transaction(async (tx) => {
    if (moveTo !== undefined) {
      const target = await tx.paymentMethod.findFirst({ where: { id: moveTo, userId } });
      if (!target || moveTo === id || target.kind === 'CREDIT' || target.kind === 'UNSPECIFIED') {
        throw new AppError(400, 'INVALID_MOVE_TARGET', 'Escolha outra forma para receber os lançamentos (Crédito não pode, porque exige um cartão).');
      }
      await tx.entry.updateMany({ where: { userId, paymentMethodId: id }, data: { paymentMethodId: moveTo } });
    } else {
      const count = await tx.entry.count({ where: { paymentMethodId: id } });
      if (count > 0) {
        throw new AppError(
          409,
          'PAYMENT_METHOD_HAS_ENTRIES',
          `Esta forma tem ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}. Escolha para qual forma movê-los antes de excluir.`,
        );
      }
    }
    await tx.paymentMethod.delete({ where: { id } });
  });
}
