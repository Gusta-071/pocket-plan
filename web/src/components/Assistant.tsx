import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addMonths, formatDate } from '../../../shared/period';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';

type Proposal = {
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  date: string;
  categoryId: number;
  categoryName: string;
  description: string;
  paid: boolean;
  repeatMonths: number;
};

type ProposalState = Proposal & { status: 'pending' | 'saving' | 'saved' | 'discarded'; error?: string };

type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; proposals: ProposalState[]; discarded: number };

const SUGGESTIONS = [
  'Paguei R$ 45 no almoço hoje',
  'Aluguei uma casa por R$ 2.000, todo dia 10',
  'Recebi R$ 1.500 de um freela ontem',
];

/**
 * Assistente (RN-66): o usuário descreve receitas e despesas em texto livre,
 * a IA propõe os lançamentos e nada é salvo sem confirmação (RN-66a).
 */
export function Assistant({ onSaved }: { onSaved: () => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ available: boolean; reason?: string }>('/assistant/status')
      .then((result) => {
        setAvailable(result.available);
        setUnavailableReason(result.reason ?? null);
      })
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const next: Message[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setError(null);
    setSending(true);
    try {
      const result = await api<{ reply: string; proposals: Proposal[]; discarded: number }>('/assistant/chat', {
        method: 'POST',
        // Só o texto da conversa vai ao servidor; as propostas ficam aqui.
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: result.reply,
          proposals: result.proposals.map((p) => ({ ...p, status: 'pending' })),
          discarded: result.discarded,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível falar com o assistente.');
      // Devolve o texto ao campo para a pessoa tentar de novo.
      setMessages(messages);
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  function updateProposal(messageIndex: number, proposalIndex: number, patch: Partial<ProposalState>) {
    setMessages((current) =>
      current.map((m, i) =>
        i === messageIndex && m.role === 'assistant'
          ? { ...m, proposals: m.proposals.map((p, j) => (j === proposalIndex ? { ...p, ...patch } : p)) }
          : m,
      ),
    );
  }

  /** Salva pelas mesmas rotas do formulário: as validações são as mesmas (RN-19 a RN-25d). */
  async function save(messageIndex: number, proposalIndex: number, proposal: ProposalState) {
    updateProposal(messageIndex, proposalIndex, { status: 'saving', error: undefined });
    try {
      const { entry } = await api<{ entry: { id: number } }>('/entries', {
        method: 'POST',
        body: JSON.stringify({
          type: proposal.type,
          amountCents: proposal.amountCents,
          date: proposal.date,
          categoryId: proposal.categoryId,
          description: proposal.description || null,
          paid: proposal.paid,
        }),
      });
      if (proposal.repeatMonths > 0) {
        await api(`/entries/${entry.id}/repeat`, { method: 'POST', body: JSON.stringify({ times: proposal.repeatMonths }) });
      }
      updateProposal(messageIndex, proposalIndex, { status: 'saved' });
      onSaved();
    } catch (err) {
      updateProposal(messageIndex, proposalIndex, {
        status: 'pending',
        error: err instanceof Error ? err.message : 'Não foi possível salvar.',
      });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  return (
    <section className="card assistant" aria-label="Assistente">
      <header className="assistant__header">
        <h2>
          <span aria-hidden="true">✨</span> Assistente
        </h2>
        <span className="small muted">Conte um gasto ou uma receita, e eu preparo o lançamento.</span>
      </header>

      <div className="assistant__messages" aria-live="polite">
        {available === false && (
          <p className="alert alert--error small">
            O assistente está desativado. {unavailableReason ?? 'O modelo local não está disponível.'}
          </p>
        )}
        {available && messages.length === 0 && (
          <div className="assistant__empty">
            <p className="small muted">Experimente:</p>
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="chip" onClick={() => void send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, i) =>
          message.role === 'user' ? (
            <p key={i} className="bubble bubble--user">
              {message.content}
            </p>
          ) : (
            <div key={i} className="assistant__answer">
              <p className="bubble bubble--assistant">{message.content}</p>
              {message.proposals.map((proposal, j) => (
                <ProposalCard
                  key={j}
                  proposal={proposal}
                  onSave={() => void save(i, j, proposal)}
                  onDiscard={() => updateProposal(i, j, { status: 'discarded' })}
                />
              ))}
              {message.discarded > 0 && (
                <p className="small muted">
                  {message.discarded === 1 ? 'Um item não pôde ser aproveitado' : `${message.discarded} itens não puderam ser aproveitados`} (valor não
                  informado ou fora das regras). Confira e mande de novo se precisar.
                </p>
              )}
            </div>
          ),
        )}
        {sending && (
          <p className="bubble bubble--assistant assistant__typing" role="status">
            Pensando…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="alert alert--error small assistant__error">{error}</p>}

      <form className="assistant__form" onSubmit={onSubmit}>
        <label htmlFor="assistant-input" className="visually-hidden">
          Mensagem para o assistente
        </label>
        <textarea
          id="assistant-input"
          rows={2}
          maxLength={1000}
          placeholder={available === false ? 'Assistente desativado' : 'Ex.: paguei 120 de luz ontem'}
          value={input}
          disabled={!available || sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra a linha.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button className="button" type="submit" disabled={!available || sending || !input.trim()}>
          Enviar
        </button>
      </form>
      <p className="assistant__note small muted">Um modelo de linguagem local, no próprio servidor, interpreta as mensagens. Confira antes de salvar.</p>
    </section>
  );
}

function ProposalCard({ proposal, onSave, onDiscard }: { proposal: ProposalState; onSave: () => void; onDiscard: () => void }) {
  const lastDate = proposal.repeatMonths > 0 ? addMonths(proposal.date, proposal.repeatMonths) : null;
  const kind = proposal.type === 'INCOME' ? 'income' : 'expense';
  const done = proposal.status === 'saved' || proposal.status === 'discarded';
  return (
    <div className={`proposal ${done ? 'proposal--done' : ''}`}>
      <div className="proposal__top">
        <strong>{proposal.description || proposal.categoryName}</strong>
        <span className={`amount amount--${kind}`}>
          {proposal.type === 'INCOME' ? '+' : '−'} {formatMoney(proposal.amountCents)}
        </span>
      </div>
      <dl className="proposal__details small">
        <div>
          <dt>Data</dt>
          <dd>{formatDate(proposal.date)}</dd>
        </div>
        <div>
          <dt>Categoria</dt>
          <dd>{proposal.categoryName}</dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{proposal.paid ? (proposal.type === 'INCOME' ? 'Recebido' : 'Pago') : 'Pendente'}</dd>
        </div>
        {lastDate && (
          <div>
            <dt>Repete</dt>
            <dd>
              Todo mês até {formatDate(lastDate)} ({proposal.repeatMonths + 1} lançamentos)
            </dd>
          </div>
        )}
      </dl>
      {proposal.error && <p className="field__error">{proposal.error}</p>}
      {proposal.status === 'saved' && <p className="proposal__status small">✓ Salvo</p>}
      {proposal.status === 'discarded' && <p className="proposal__status small muted">Descartado</p>}
      {!done && (
        <div className="proposal__actions">
          <button className="button" type="button" onClick={onSave} disabled={proposal.status === 'saving'}>
            {proposal.status === 'saving' ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="button button--ghost" type="button" onClick={onDiscard} disabled={proposal.status === 'saving'}>
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}
