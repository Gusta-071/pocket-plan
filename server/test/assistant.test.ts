import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { AssistantUnavailableError, askModel, type ModelProposal } from '../src/modules/assistant/assistant.model.js';
import { amountsIn, statusIn, ASSISTANT_LIMIT, resetAssistantLimit, resolveWhen } from '../src/modules/assistant/assistant.service.js';
import { createVerifiedUser, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));
// O modelo é simulado: os testes conferem o que o app faz com a resposta, sem depender do Ollama.
vi.mock('../src/modules/assistant/assistant.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/modules/assistant/assistant.model.js')>()),
  askModel: vi.fn(),
}));

const app = createApp();
const ask = vi.mocked(askModel);
let cookie: string;
let housing: number;

// Terça-feira, 24/11/2026.
const TODAY = '2026-11-24';

const send = (text: string, sessionCookie = cookie) =>
  request(app).post('/api/assistant/chat').set('Cookie', sessionCookie).send({ messages: [{ role: 'user', content: text }] });

function proposal(overrides: Partial<ModelProposal> = {}): ModelProposal {
  return { type: 'EXPENSE', amount: 2000, when: 'dia 10', category: 'Moradia', description: 'Aluguel', status: 'nao_informado', repeatMonths: 0, ...overrides };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  resetAssistantLimit();
  ask.mockReset();
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  const categories = (await request(app).get('/api/categories').set('Cookie', cookie)).body.categories as { id: number; name: string }[];
  housing = categories.find((c) => c.name === 'Moradia')!.id;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('conversão de datas (RN-66e)', () => {
  it.each([
    ['hoje', false, '2026-11-24'],
    ['ontem', false, '2026-11-23'],
    ['Anteontem', false, '2026-11-22'],
    ['amanhã', false, '2026-11-25'],
    ['2026-12-03', false, '2026-12-03'],
    ['05/12', false, '2026-12-05'],
    ['05/12/2027', false, '2027-12-05'],
    ['dia 28', false, '2026-11-28'], // ainda não passou: este mês
    ['dia 10', false, '2026-11-10'], // gasto único: o dia 10 deste mês, que já passou
    ['dia 10', true, '2026-12-10'], // repete e o dia já passou: começa no mês que vem
    ['dia 31', false, '2026-11-30'], // novembro não tem 31: último dia
    ['semana passada', false, '2026-11-24'], // desconhecida: hoje
  ])('"%s" (repete: %s) → %s', (when, recurring, expected) => {
    expect(resolveWhen(when, TODAY, recurring)).toBe(expected);
  });
});

describe('valores escritos no texto', () => {
  it.each([
    ['paguei 45,90 no almoço', 4590],
    ['recebi 1.500 de freela', 150000],
    ['aluguel de 2 mil', 200000],
    ['1,5 mil de bônus', 150000],
    ['gastei mil reais', 100000],
    ['R$ 2.000,50 de reforma', 200050],
  ])('"%s" contém %i centavos', (text, cents) => {
    expect(amountsIn(text).has(cents)).toBe(true);
  });

  it.each([
    ['internet 99,90 dia 20 ainda não paguei', 'pendente'],
    ['conta de luz vence dia 28', 'pendente'],
    ['vou pagar o dentista amanhã', 'pendente'],
    ['paguei o IPTU', 'pago'],
    ['recebi 200 da minha avó', 'pago'],
    ['almoço de 45', null],
  ])('situação em "%s": %s', (text, expected) => {
    expect(statusIn(text)).toBe(expected);
  });

  it('frase sem número não tem valor', () => {
    expect(amountsIn('comprei um tênis').size).toBe(0);
  });
});

describe('assistente (RN-66)', () => {
  it('manda ao modelo a data e as categorias, e converte a resposta em proposta', async () => {
    ask.mockResolvedValue({ reply: 'Preparei o aluguel mensal. Confere?', proposals: [proposal({ repeatMonths: 11 })] });

    const response = await send('Aluguei uma casa por 2 mil todo dia 10');
    expect(response.status).toBe(200);
    expect(response.body.reply).toBe('Preparei o aluguel mensal. Confere?');
    expect(response.body.proposals).toEqual([
      // "dia 10" de algo mensal, com o dia 10 já passado: começa em dezembro, pendente.
      { type: 'EXPENSE', amountCents: 200000, date: '2026-12-10', categoryId: housing, categoryName: 'Moradia', description: 'Aluguel', paid: false, repeatMonths: 11 },
    ]);

    const [context, history] = ask.mock.calls[0]!;
    expect(context.today).toBe(TODAY);
    expect(context.weekday).toBe('terça-feira');
    expect(context.categories).toContainEqual({ type: 'EXPENSE', name: 'Moradia' });
    expect(history).toEqual([{ role: 'user', content: 'Aluguei uma casa por 2 mil todo dia 10' }]);
  });

  it('converte o valor em centavos e a situação dita pela pessoa (RN-22)', async () => {
    ask.mockResolvedValue({
      reply: 'ok',
      proposals: [
        proposal({ amount: 45.9, when: 'ontem', category: 'Alimentação', description: 'Almoço' }), // sem situação: data passada → pago
        proposal({ amount: 120, when: 'ontem', status: 'pendente', category: 'Contas e serviços' }), // disse que não pagou
        proposal({ amount: 300, when: 'amanhã', status: 'pago' }), // disse que já pagou
      ],
    });
    const { proposals } = (await send('almoço de 45,90 ontem, luz de 120 ontem que não paguei e 300 amanhã que já paguei')).body;
    expect(proposals.map((p: { amountCents: number; paid: boolean }) => [p.amountCents, p.paid])).toEqual([
      [4590, true],
      [12000, false],
      [30000, true],
    ]);
  });

  it('um sinal claro na frase vence o palpite do modelo sobre a situação', async () => {
    ask.mockResolvedValue({ reply: 'ok', proposals: [proposal({ amount: 99.9, when: 'dia 20', category: 'Contas e serviços', status: 'pago' })] });
    expect((await send('internet 99,90 dia 20 ainda não paguei')).body.proposals[0].paid).toBe(false);
  });

  it('não salva nada: só propõe (RN-66a)', async () => {
    ask.mockResolvedValue({ reply: 'ok', proposals: [proposal()] });
    await send('Aluguel de 2 mil');
    const entries = await request(app).get('/api/entries?start=2026-01-01&end=2027-12-31').set('Cookie', cookie);
    expect(entries.body.entries).toHaveLength(0);
  });

  it('confere as propostas contra as regras dos lançamentos (RN-66b)', async () => {
    ask.mockResolvedValue({
      reply: 'ok',
      proposals: [
        proposal({ amount: 0 }), // valor inválido: descartada
        proposal({ amount: 20_000_000 }), // acima de R$ 10 milhões: descartada
        proposal({ when: '05/12/2030' }), // passa de 12 meses: descartada
        proposal({ category: 'Salário' }), // categoria de receita numa despesa: vai para "Outras despesas"
        proposal({ category: 'Inventada' }), // categoria que não existe: idem
        proposal({ when: '10/06/2027', repeatMonths: 12 }), // só cabem 5 repetições até 24/11/2027
        { type: 'EXPENSE', amount: 'muito' } as never, // formato errado: descartada
      ],
    });

    const { proposals, discarded } = (await send('0, 20.000.000 e 2 mil')).body;
    expect(discarded).toBe(4);
    expect(proposals.map((p: { categoryName: string }) => p.categoryName)).toEqual(['Outras despesas', 'Outras despesas', 'Moradia']);
    expect(proposals[2].repeatMonths).toBe(5);
  });

  it('não aceita valor que a pessoa não escreveu: pergunta o valor (RN-66b)', async () => {
    // Modelos pequenos às vezes inventam um valor quando a frase não tem nenhum.
    ask.mockResolvedValue({ reply: 'Anotei o tênis. Confere?', proposals: [proposal({ amount: 45, category: 'Compras', description: 'Tênis' })] });
    const response = (await send('comprei um tênis')).body;
    expect(response.proposals).toEqual([]);
    expect(response.reply).toContain('Qual foi o valor');

    // Respondendo à pergunta, o valor passa a constar na conversa.
    ask.mockResolvedValue({ reply: 'ok', proposals: [proposal({ amount: 350, when: 'hoje', category: 'Compras', description: 'Tênis' })] });
    const answer = await request(app)
      .post('/api/assistant/chat')
      .set('Cookie', cookie)
      .send({ messages: [{ role: 'user', content: 'comprei um tênis' }, { role: 'assistant', content: 'Qual foi o valor?' }, { role: 'user', content: 'foi 350' }] });
    expect(answer.body.proposals[0].amountCents).toBe(35000);
  });

  it('usa a categoria que a pessoa já usou para a mesma descrição', async () => {
    const food = ((await request(app).get('/api/categories').set('Cookie', cookie)).body.categories as { id: number; name: string }[]).find((c) => c.name === 'Alimentação')!.id;
    await request(app).post('/api/entries').set('Cookie', cookie).send({ type: 'EXPENSE', amountCents: 10000, date: '2026-11-01', categoryId: food, description: 'Mercado' }).expect(201);

    ask.mockResolvedValue({ reply: 'ok', proposals: [proposal({ amount: 230, when: 'hoje', category: 'Compras', description: 'mercado' })] });
    expect((await send('230 no mercado')).body.proposals[0].categoryName).toBe('Alimentação');
  });

  it('valida a conversa enviada', async () => {
    const post = (messages: unknown) => request(app).post('/api/assistant/chat').set('Cookie', cookie).send({ messages });
    expect((await post([])).status).toBe(400);
    expect((await post([{ role: 'user', content: '   ' }])).status).toBe(400);
    expect((await post([{ role: 'user', content: 'x'.repeat(1001) }])).status).toBe(400);
    expect((await post([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }])).status).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });

  it('limita as mensagens por usuário (RN-66c)', async () => {
    ask.mockResolvedValue({ reply: 'ok', proposals: [] });
    for (let i = 0; i < ASSISTANT_LIMIT; i++) expect((await send('oi')).status).toBe(200);

    const blocked = await send('oi');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('ASSISTANT_LIMIT');
    expect((await send('oi', await createVerifiedUser(app, 'outro@example.com'))).status).toBe(200);
  });

  it('explica quando o modelo local não está disponível', async () => {
    ask.mockRejectedValue(new AssistantUnavailableError('O Ollama não está rodando nesta máquina.'));
    const response = await send('oi');
    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({ code: 'ASSISTANT_UNAVAILABLE', message: 'O Ollama não está rodando nesta máquina.' });
  });

  it('trata resposta fora do formato', async () => {
    ask.mockResolvedValue({ texto: 'sem o formato' } as never);
    expect((await send('oi')).status).toBe(502);
  });

  it('exige login (RN-08)', async () => {
    expect((await request(app).post('/api/assistant/chat').send({ messages: [{ role: 'user', content: 'oi' }] })).status).toBe(401);
  });
});
