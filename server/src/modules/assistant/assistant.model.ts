/**
 * Adaptador do modelo de linguagem local (RN-66), servido pelo Ollama na própria máquina.
 *
 * O modelo pequeno só interpreta a frase: tipo, valor em reais, quando, categoria (escolhida
 * de uma lista fechada), descrição, situação e repetição. Converter datas e valores e aplicar
 * as regras dos lançamentos é trabalho do servidor (assistant.service.ts), que não erra conta.
 *
 * Todo o acesso ao modelo fica neste arquivo: os testes trocam askModel por uma resposta pronta.
 */

const AI_URL = () => process.env.AI_URL || 'http://localhost:11434';
/** Modelo pequeno padrão; outro modelo do Ollama pode ser usado com AI_MODEL no .env. */
export const ASSISTANT_MODEL = () => process.env.AI_MODEL || 'qwen2.5:1.5b-instruct';

/** Tempo máximo de uma resposta. A primeira chamada carrega o modelo na memória e demora mais. */
const TIMEOUT_MS = 90_000;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** O que o modelo devolve para cada lançamento que reconheceu. */
export type ModelProposal = {
  type: 'INCOME' | 'EXPENSE';
  /** Em reais, como a pessoa escreveu ("2 mil" = 2000). */
  amount: number;
  /** "hoje", "ontem", "anteontem", "amanhã", "dia 10", "10/12" ou "AAAA-MM-DD". */
  when: string;
  /** Nome exato de uma das categorias do usuário. */
  category: string;
  description: string;
  /** Se a pessoa disse que já pagou/recebeu ou que ainda não; senão, "nao_informado". */
  status: 'pago' | 'pendente' | 'nao_informado';
  /** Quantas vezes repetir depois do primeiro lançamento (0 a 12). */
  repeatMonths: number;
};

export type ModelAnswer = { reply: string; proposals: ModelProposal[] };

export type CategoryOption = { type: 'INCOME' | 'EXPENSE'; name: string };

export class AssistantUnavailableError extends Error {}

/** O Ollama está rodando e com o modelo baixado? */
export async function assistantStatus(): Promise<{ available: boolean; reason?: string }> {
  try {
    const response = await fetch(`${AI_URL()}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    const { models } = (await response.json()) as { models: { name: string }[] };
    const model = ASSISTANT_MODEL();
    if (!models.some((m) => m.name === model || m.name === `${model}:latest`)) {
      return { available: false, reason: `O modelo ${model} não está baixado. Rode: ollama pull ${model}` };
    }
    return { available: true };
  } catch {
    return { available: false, reason: 'O Ollama não está rodando nesta máquina. Abra o Ollama ou rode: ollama serve' };
  }
}

/** Palavras que ajudam o modelo pequeno a escolher as categorias padrão (RN-15). */
const CATEGORY_HINTS: Record<string, string> = {
  Alimentação: 'mercado, supermercado, feira, padaria, almoço, jantar, restaurante, lanche, iFood, delivery',
  Moradia: 'aluguel, condomínio, IPTU, casa, apartamento, reforma',
  Transporte: 'Uber, 99, táxi, ônibus, metrô, combustível, gasolina, estacionamento, pedágio',
  Saúde: 'farmácia, remédio, consulta, médico, dentista, exame, academia, plano de saúde',
  Educação: 'faculdade, escola, curso, livro, material, mensalidade',
  Lazer: 'cinema, show, bar, viagem, passeio, festa, jogo',
  Compras: 'roupa, tênis, sapato, eletrônico, presente, loja, shopping',
  'Contas e serviços': 'luz, energia, água, gás, internet, celular, telefone',
  Assinaturas: 'Netflix, Spotify, streaming, assinatura, app',
  Salário: 'salário, pagamento do trabalho',
  Freelance: 'freela, freelance, projeto, bico',
};

function instructions(today: string, weekday: string, categories: CategoryOption[]): string {
  const hints = categories
    .filter((c) => CATEGORY_HINTS[c.name])
    .map((c) => `- ${c.name}: ${CATEGORY_HINTS[c.name]}`)
    .join('\n');
  const names = (type: string) =>
    categories
      .filter((c) => c.type === type)
      .map((c) => c.name)
      .join(', ');
  return `Você transforma frases sobre dinheiro em lançamentos de um app financeiro brasileiro. Responda só com JSON.

Hoje é ${today} (${weekday}).
Categorias de despesa: ${names('EXPENSE')}.
Categorias de receita: ${names('INCOME')}.
${hints ? `Dicas de categoria:\n${hints}\n` : ''}
Para cada gasto ou entrada de dinheiro na frase, crie um item em "proposals":
- type: "EXPENSE" para gasto, "INCOME" para dinheiro recebido.
- amount: valor em reais, como número. "45,90" = 45.9; "2 mil" = 2000; "1.500" = 1500.
- when: copie a expressão de data da frase: "hoje", "ontem", "anteontem", "amanhã", "dia 10", "10/12". Sem data, use "hoje".
- category: o nome exato de uma categoria da lista, do mesmo tipo.
- description: curta, sem o valor. Ex.: "Aluguel", "Almoço", "Freela".
- status: "pago" se a pessoa disse que já pagou ou recebeu; "pendente" se disse que ainda vai pagar; senão "nao_informado".
- repeatMonths: se repete todo mês sem prazo, 11; "por 6 meses", 5; se não repete, 0.

"reply": uma frase curta em português resumindo o que entendeu e pedindo para conferir.
Se a frase não tiver valor, não invente: proposals vazio e reply perguntando o valor.

Exemplo: "paguei 45 no almoço ontem" → {"reply":"Anotei o almoço de ontem. Confere?","proposals":[{"type":"EXPENSE","amount":45,"when":"ontem","category":"Alimentação","description":"Almoço","status":"pago","repeatMonths":0}]}
Exemplo: "aluguei uma casa por 2 mil todo dia 10" → {"reply":"Preparei o aluguel mensal. Confere?","proposals":[{"type":"EXPENSE","amount":2000,"when":"dia 10","category":"Moradia","description":"Aluguel","status":"nao_informado","repeatMonths":11}]}
Exemplo: "conta de água de 98,50 vence dia 15" → {"reply":"Anotei a conta de água. Confere?","proposals":[{"type":"EXPENSE","amount":98.5,"when":"dia 15","category":"Contas e serviços","description":"Conta de água","status":"pendente","repeatMonths":0}]}
Exemplo: "spotify 21,90 todo mês" → {"reply":"Preparei a assinatura mensal. Confere?","proposals":[{"type":"EXPENSE","amount":21.9,"when":"hoje","category":"Assinaturas","description":"Spotify","status":"nao_informado","repeatMonths":11}]}
Exemplo: "caiu o salário de 5 mil" → {"reply":"Anotei o salário. Confere?","proposals":[{"type":"INCOME","amount":5000,"when":"hoje","category":"Salário","description":"Salário","status":"pago","repeatMonths":0}]}

Lembre: conta, boleto, assinatura, compra e "paguei" são sempre EXPENSE. Só é INCOME quando a pessoa recebe dinheiro.`;
}

/** Formato da resposta: o Ollama obriga o modelo a seguir este esquema (categorias numa lista fechada). */
function answerSchema(categories: CategoryOption[]) {
  return {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
            amount: { type: 'number' },
            when: { type: 'string' },
            category: { type: 'string', enum: categories.map((c) => c.name) },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pago', 'pendente', 'nao_informado'] },
            repeatMonths: { type: 'integer' },
          },
          required: ['type', 'amount', 'when', 'category', 'description', 'status', 'repeatMonths'],
        },
      },
    },
    required: ['reply', 'proposals'],
  };
}

/** Pergunta ao modelo local. */
export async function askModel(
  context: { today: string; weekday: string; categories: CategoryOption[] },
  history: ChatTurn[],
): Promise<ModelAnswer> {
  let response: Response;
  try {
    response = await fetch(`${AI_URL()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: ASSISTANT_MODEL(),
        stream: false,
        format: answerSchema(context.categories),
        // Temperatura zero: a mesma frase gera a mesma interpretação.
        options: { temperature: 0 },
        messages: [{ role: 'system', content: instructions(context.today, context.weekday, context.categories) }, ...history],
      }),
    });
  } catch {
    const { reason } = await assistantStatus();
    throw new AssistantUnavailableError(reason ?? 'O modelo local demorou demais para responder. Tente de novo.');
  }
  if (!response.ok) {
    const { reason } = await assistantStatus();
    throw new AssistantUnavailableError(reason ?? `O modelo local respondeu com erro (${response.status}).`);
  }
  const body = (await response.json()) as { message?: { content?: string } };
  return JSON.parse(body.message?.content ?? '') as ModelAnswer;
}
