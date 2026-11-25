import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, shiftPeriod, today, type Period } from '../../../shared/period';
import type { User } from '../auth/AuthContext';
import { BillRow, InvoiceSheet, toggleBill, type BillItem } from '../components/BillRow';
import { EntrySheet, type EntrySheetMode } from '../components/EntrySheet';
import { Alert } from '../components/Form';
import { PeriodNav } from '../components/PeriodNav';
import { api } from '../lib/api';
import type { Category } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { usePayments } from '../lib/payments';
import { useCategories } from '../lib/useCategories';

type Bills = {
  period: Period & { isCurrent: boolean };
  progress: { paidCount: number; totalCount: number; paidCents: number; pendingCents: number };
  expenses: BillItem[];
  receivables: { entries: BillItem[]; totalCents: number };
  previousOverdue: { entries: BillItem[]; expenseCents: number; incomeCents: number };
};

/** Contas do mês (RN-50 a RN-50d): checklist das despesas do período, com o progresso no topo. */
export function BillsPage({ user }: { user: User }) {
  const { categories } = useCategories();
  const { methods, cards } = usePayments();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Bills | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<EntrySheetMode | null>(null);
  const [openInvoice, setOpenInvoice] = useState<BillItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastRequest = useRef(0);

  const period = shiftPeriod(today(), offset, user.monthStartDay, user.periodNaming);

  const load = useCallback(async () => {
    const request = ++lastRequest.current;
    try {
      const result = await api<Bills>(`/bills?date=${period.start}`);
      if (request !== lastRequest.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (request !== lastRequest.current) return;
      setError(err instanceof Error ? err.message : 'Erro ao carregar as contas.');
    }
  }, [period.start]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: BillItem) {
    try {
      await toggleBill(item);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a conta.');
    }
  }

  const byId = new Map<number, Category>((categories ?? []).map((c) => [c.id, c]));
  const progress = data?.progress;
  const percent = progress && progress.totalCount > 0 ? Math.round((progress.paidCount / progress.totalCount) * 100) : 0;

  const row = (item: BillItem) => (
    <BillRow
      key={item.id}
      item={item}
      categories={byId}
      methods={methods ?? []}
      cards={cards ?? []}
      onToggle={() => void toggle(item)}
      onOpen={() => (item.invoice ? setOpenInvoice(item) : setSheet({ kind: 'edit', entry: item }))}
    />
  );

  return (
    <>
      <div className="page-header wide-header">
        <h1>Contas do mês</h1>
        <div className="wide-header__period">
          <PeriodNav period={period} offset={offset} onChange={setOffset} />
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="warning">{notice}</Alert>}
      {!data && !error && (
        <p className="muted" role="status">
          Carregando…
        </p>
      )}

      {data && progress && (
        // No PC: a lista à esquerda e o resumo (progresso, atrasadas, a receber) numa coluna fixa à direita.
        <div className="bills">
          <div className="bills__side">
            {/* RN-50a */}
            <section className="card bills-progress" aria-label="Progresso das contas">
              <div className="bills-progress__top">
                <strong>
                  {progress.totalCount === 0
                    ? 'Nenhuma conta neste período'
                    : `${progress.paidCount} de ${progress.totalCount} ${progress.totalCount === 1 ? 'conta paga' : 'contas pagas'}`}
                </strong>
                {progress.pendingCents > 0 ? (
                  <span className="muted small">
                    Falta pagar <strong className="amount--expense">{formatMoney(progress.pendingCents)}</strong>
                  </span>
                ) : (
                  progress.totalCount > 0 && <span className="small amount--income">Tudo pago 🎉</span>
                )}
              </div>
              <span className="meter" role="img" aria-label={`${percent}% das contas pagas`}>
                <span className={`meter__fill ${percent === 100 ? 'meter__fill--done' : ''}`} style={{ width: `${percent}%` }} />
              </span>
            </section>

            {/* RN-50c: atrasadas de meses anteriores, num aviso recolhível */}
            {data.previousOverdue.entries.length > 0 && (
              <details className="alert alert--error bills-overdue" data-destaque="atrasadas">
                <summary>
                  <strong>
                    {data.previousOverdue.entries.length === 1
                      ? '1 conta atrasada de meses anteriores'
                      : `${data.previousOverdue.entries.length} contas atrasadas de meses anteriores`}
                  </strong>
                  {' · '}
                  {[
                    data.previousOverdue.expenseCents > 0 && `${formatMoney(data.previousOverdue.expenseCents)} a pagar`,
                    data.previousOverdue.incomeCents > 0 && `${formatMoney(data.previousOverdue.incomeCents)} a receber`,
                  ]
                    .filter(Boolean)
                    .join(' e ')}
                </summary>
                <ul className="list bills-overdue__list">{data.previousOverdue.entries.map(row)}</ul>
              </details>
            )}
          </div>

          <div className="bills__main">
            {data.expenses.length > 0 ? (
              // Sem atrasadas de meses anteriores, o aviso de atrasadas destaca a lista do mês, onde elas estão.
              <ul className="list" data-destaque={data.previousOverdue.entries.length > 0 ? 'a-vencer' : 'a-vencer atrasadas'}>
                {data.expenses.map(row)}
              </ul>
            ) : (
              <div className="empty">
                <p>Nenhuma despesa neste período.</p>
                <p className="muted small">As despesas lançadas em Lançamentos aparecem aqui como contas a pagar.</p>
              </div>
            )}
          </div>

          <div className="bills__extra">
            {/* RN-50b */}
            {data.receivables.entries.length > 0 && (
              <section className="bills-receivables">
                <div className="section-header">
                  <h2>A receber</h2>
                  <span className="small amount--income">{formatMoney(data.receivables.totalCents)}</span>
                </div>
                <ul className="list">{data.receivables.entries.map(row)}</ul>
              </section>
            )}

            <p className="muted small bills-footnote">
              Contas que vencem de {formatDate(data.period.start)} a {formatDate(data.period.end)}. As compras no cartão aparecem na fatura,
              no mês do vencimento.
            </p>
          </div>
        </div>
      )}

      {sheet && categories && methods && cards && (
        <EntrySheet
          mode={sheet}
          categories={categories}
          methods={methods}
          cards={cards}
          onClose={() => setSheet(null)}
          onSaved={(_date, warning) => {
            setSheet(null);
            setNotice(warning ?? null);
            void load();
          }}
        />
      )}
      {openInvoice && cards && (
        <InvoiceSheet
          item={openInvoice}
          categories={byId}
          cards={cards}
          onClose={() => setOpenInvoice(null)}
          onChanged={() => {
            setOpenInvoice(null);
            void load();
          }}
        />
      )}
    </>
  );
}
