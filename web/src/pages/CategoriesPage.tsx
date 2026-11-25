import { useCallback, useEffect, useState } from 'react';
import { BudgetAmountSheet } from '../components/BudgetAmountSheet';
import { Alert, Field } from '../components/Form';
import { MoneyInput } from '../components/MoneyInput';
import { Sheet } from '../components/Sheet';
import { api, ApiError } from '../lib/api';
import { useBudgets, type LimitedClass } from '../lib/budgets';
import {
  CATEGORY_COLORS,
  EXPENSE_CLASS_LABELS,
  EXPENSE_CLASSES,
  TYPE_LABELS,
  type Category,
  type CategoryColor,
  type CategoryType,
  type ExpenseClass,
} from '../lib/categories';
import { formatMoney } from '../lib/money';
import { Link } from '../lib/router';
import { useSubmit } from '../lib/useSubmit';

const MAX_PER_TYPE = 30; // RN-16b

type Editing =
  | { mode: 'create'; type: CategoryType }
  | { mode: 'edit'; category: Category }
  | { mode: 'class-limit'; expenseClass: LimitedClass }
  | null;

const isLimited = (expenseClass: ExpenseClass | null): expenseClass is LimitedClass =>
  expenseClass === 'FIXED' || expenseClass === 'VARIABLE';

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [editing, setEditing] = useState<Editing>(null);
  const { budgets, reload: reloadBudgets, setBudgets } = useBudgets();
  const limitOf = new Map((budgets?.categoryLimits ?? []).map((l) => [l.categoryId, l.amountCents]));

  const load = useCallback(async () => {
    try {
      const result = await api<{ categories: Category[] }>('/categories');
      setCategories(result.categories);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar as categorias.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sameType = (category: Category) => categories?.filter((c) => c.type === category.type) ?? [];

  function closeAndReload() {
    setEditing(null);
    void load();
    void reloadBudgets();
  }

  const ofType = (t: CategoryType) => categories?.filter((category) => category.type === t) ?? [];

  // As despesas aparecem agrupadas pela classe (RN-14a).
  function groupsOf(t: CategoryType) {
    const items = ofType(t);
    return t === 'EXPENSE'
      ? EXPENSE_CLASSES.map((expenseClass) => ({
          expenseClass,
          title: EXPENSE_CLASS_LABELS[expenseClass].plural,
          items: items.filter((c) => c.expenseClass === expenseClass),
        })).filter((group) => group.items.length > 0)
      : [{ expenseClass: null, title: null, items }];
  }

  /** Uma coluna por tipo: no PC, despesas e receitas lado a lado; no celular, uma de cada vez. */
  function column(t: CategoryType) {
    const count = ofType(t).length;
    return (
      <section key={t} className={`categories__column ${type === t ? '' : 'categories__column--inactive'}`} aria-label={TYPE_LABELS[t].plural}>
        <div className="categories__column-header">
          <h2>{TYPE_LABELS[t].plural}</h2>
          <button className="button" type="button" onClick={() => setEditing({ mode: 'create', type: t })} disabled={count >= MAX_PER_TYPE}>
            + Nova
          </button>
        </div>
        {groupsOf(t).map((group) => (
          <section key={group.title ?? 'all'}>
            {group.title && (
              <div className="class-group__header">
                <h3 className="class-group__title">{group.title}</h3>
                {/* RN-29a: limite da classe inteira. Investimento tem meta, editada no painel (RN-29b). */}
                {isLimited(group.expenseClass) && budgets && (
                  <button
                    type="button"
                    className="link-button small"
                    onClick={() => setEditing({ mode: 'class-limit', expenseClass: group.expenseClass as LimitedClass })}
                  >
                    {budgets.classLimits[group.expenseClass] === null
                      ? 'Definir limite da classe'
                      : `Limite da classe: ${formatMoney(budgets.classLimits[group.expenseClass]!)}`}
                  </button>
                )}
              </div>
            )}
            {isLimited(group.expenseClass) && budgets?.classWarnings[group.expenseClass] && (
              <p className="alert alert--warning small" role="status">
                A soma dos limites das categorias passou do limite da classe. Tudo bem, mas confira se é isso mesmo.
              </p>
            )}
            <ul className="list" aria-label={group.title ?? TYPE_LABELS[t].plural}>
              {group.items.map((category) => (
                <li key={category.id}>
                  <button type="button" className="list__item" onClick={() => setEditing({ mode: 'edit', category })}>
                    <span className="color-dot" style={{ background: CATEGORY_COLORS[category.color].hex }} aria-hidden="true" />
                    <span className="list__label">{category.name}</span>
                    {limitOf.has(category.id) && <span className="muted small">Limite {formatMoney(limitOf.get(category.id)!)}</span>}
                    <span className="list__action" aria-hidden="true">
                      Editar
                    </span>
                    <span className="visually-hidden">, editar</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="muted small">
          {count} de {MAX_PER_TYPE} categorias de {TYPE_LABELS[t].singular}.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Categorias</h1>
      </div>

      {/* No celular, escolhe o tipo; no PC, os dois aparecem lado a lado e a escolha some. */}
      <div className="segmented categories__switch" role="tablist" aria-label="Tipo de categoria">
        {(['EXPENSE', 'INCOME'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={type === option}
            className="segmented__option"
            onClick={() => setType(option)}
          >
            {TYPE_LABELS[option].plural}
          </button>
        ))}
      </div>

      {loadError && (
        <Alert kind="error">
          {loadError}{' '}
          <button className="link-button" type="button" onClick={() => void load()}>
            Tentar de novo
          </button>
        </Alert>
      )}

      {!categories && !loadError && (
        <p className="muted" role="status">
          Carregando…
        </p>
      )}

      {categories && <div className="categories">{(['EXPENSE', 'INCOME'] as const).map(column)}</div>}

      {editing?.mode === 'create' && (
        <CategorySheet type={editing.type} onClose={() => setEditing(null)} onSaved={closeAndReload} />
      )}
      {editing?.mode === 'class-limit' && budgets && (
        <BudgetAmountSheet
          title={`Limite das despesas ${EXPENSE_CLASS_LABELS[editing.expenseClass].plural.toLowerCase()}`}
          label="Limite mensal da classe"
          description="Soma todas as categorias da classe. É independente dos limites de cada categoria."
          target={{ kind: 'CLASS_LIMIT', expenseClass: editing.expenseClass }}
          currentCents={budgets.classLimits[editing.expenseClass]}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setBudgets(next);
            setEditing(null);
          }}
        />
      )}
      {editing?.mode === 'edit' && (
        <CategorySheet
          type={editing.category.type}
          category={editing.category}
          currentLimit={limitOf.get(editing.category.id) ?? null}
          siblings={sameType(editing.category).filter((c) => c.id !== editing.category.id)}
          onClose={() => setEditing(null)}
          onSaved={closeAndReload}
        />
      )}
    </>
  );
}

type SheetProps = {
  type: CategoryType;
  category?: Category;
  siblings?: Category[];
  /** Limite em vigor no período atual (RN-29), se houver. */
  currentLimit?: number | null;
  onClose: () => void;
  onSaved: () => void;
};

function CategorySheet({ type, category, siblings = [], currentLimit = null, onClose, onSaved }: SheetProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<CategoryColor>(category?.color ?? 'blue');
  // RN-14a: numa categoria nova, nenhuma classe vem marcada.
  const [expenseClass, setExpenseClass] = useState<ExpenseClass | null>(category?.expenseClass ?? null);
  const [limit, setLimit] = useState(currentLimit ?? 0);
  const [deleting, setDeleting] = useState(false);
  // RN-17: virar Investimento remove o limite; a tela avisa antes de salvar.
  const losesLimit = currentLimit !== null && expenseClass === 'INVESTMENT';

  const save = useSubmit(async () => {
    // RN-29: o limite (opcional) vai junto com a categoria, numa operação só; R$ 0,00 quer dizer sem limite.
    const limitChange = isLimited(expenseClass) && limit !== (currentLimit ?? 0) ? { limitCents: limit > 0 ? limit : null } : {};
    if (category) {
      const changes = type === 'EXPENSE' && expenseClass ? { name, color, expenseClass, ...limitChange } : { name, color };
      await api(`/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    } else {
      await api('/categories', { method: 'POST', body: JSON.stringify({ type, name, color, expenseClass, ...limitChange }) });
    }
    onSaved();
  });

  const typeLabel = TYPE_LABELS[type].singular;

  if (category && deleting) {
    return (
      <Sheet title="Excluir categoria" onClose={onClose}>
        <DeleteCategory
          category={category}
          siblings={siblings}
          hasLimit={currentLimit !== null}
          onCancel={() => setDeleting(false)}
          onDeleted={onSaved}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title={category ? 'Editar categoria' : `Nova categoria de ${typeLabel}`} onClose={onClose}>
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <Field
          label="Nome"
          value={name}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          error={save.fieldErrors.name}
        />
        {type === 'EXPENSE' && (
          <fieldset className="class-picker" aria-invalid={save.fieldErrors.expenseClass ? true : undefined}>
            <legend>Classe</legend>
            <div className="class-picker__options">
              {EXPENSE_CLASSES.map((option) => (
                <label key={option} className="class-picker__option">
                  <input
                    type="radio"
                    name="expenseClass"
                    value={option}
                    checked={expenseClass === option}
                    onChange={() => setExpenseClass(option)}
                    className="visually-hidden"
                  />
                  <span className="class-picker__label">{EXPENSE_CLASS_LABELS[option].label}</span>
                  <span className="class-picker__hint">{EXPENSE_CLASS_LABELS[option].hint}</span>
                </label>
              ))}
            </div>
            {save.fieldErrors.expenseClass && <span className="field__error">{save.fieldErrors.expenseClass}</span>}
          </fieldset>
        )}
        {isLimited(expenseClass) && (
          <div className="form__group">
            <MoneyInput label="Limite mensal (opcional)" cents={limit} onChange={setLimit} error={save.fieldErrors.limitCents} />
            <p className="muted small">
              Deixe R$ 0,00 para não ter limite. Vale a partir deste mês; os meses anteriores continuam com o valor que tinham.
            </p>
          </div>
        )}
        {losesLimit && (
          <Alert kind="warning">
            Investimento não tem limite, só meta. Ao salvar, o limite de {formatMoney(currentLimit!)} desta categoria será removido.
          </Alert>
        )}
        <fieldset className="palette">
          <legend>Cor</legend>
          <div className="palette__grid">
            {(Object.keys(CATEGORY_COLORS) as CategoryColor[]).map((key) => (
              <label key={key} className="palette__option" title={CATEGORY_COLORS[key].label}>
                <input
                  type="radio"
                  name="color"
                  value={key}
                  checked={color === key}
                  onChange={() => setColor(key)}
                  className="visually-hidden"
                />
                <span className="palette__swatch" style={{ background: CATEGORY_COLORS[key].hex }} aria-hidden="true" />
                <span className="visually-hidden">{CATEGORY_COLORS[key].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {category && <p className="muted small">Tipo: {typeLabel} (não pode ser alterado).</p>}
        <button className="button" type="submit" disabled={save.submitting}>
          {save.submitting ? 'Salvando…' : 'Salvar'}
        </button>
        {category && (
          <button className="button button--danger-ghost" type="button" onClick={() => setDeleting(true)}>
            Excluir categoria
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** RN-18: confirmação; se houver lançamentos, escolhe para onde movê-los. RN-18a: a última do tipo não sai. */
function DeleteCategory({
  category,
  siblings,
  hasLimit,
  onCancel,
  onDeleted,
}: {
  category: Category;
  siblings: Category[];
  hasLimit: boolean;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [entriesMessage, setEntriesMessage] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<number | ''>('');

  const remove = useSubmit(async () => {
    const query = entriesMessage && moveTo !== '' ? `?moveTo=${moveTo}` : '';
    try {
      await api(`/categories/${category.id}${query}`, { method: 'DELETE' });
      onDeleted();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CATEGORY_HAS_ENTRIES') {
        setEntriesMessage(error.message);
        return;
      }
      throw error;
    }
  });

  if (siblings.length === 0) {
    return (
      <div className="form">
        <Alert kind="error">
          Esta é sua única categoria de {TYPE_LABELS[category.type].singular}. É preciso manter pelo menos uma, mas você
          pode renomeá-la.
        </Alert>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={remove.onSubmit}>
      {remove.error && <Alert kind="error">{remove.error}</Alert>}
      {entriesMessage ? (
        <>
          <p>{entriesMessage}</p>
          <div className="field">
            <label htmlFor="move-to">Mover lançamentos para</label>
            <select id="move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Escolha uma categoria</option>
              {siblings.map((sibling) => (
                <option key={sibling.id} value={sibling.id}>
                  {sibling.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p>
          Excluir a categoria <strong>{category.name}</strong>? Essa ação não pode ser desfeita.
        </p>
      )}
      {hasLimit && <p className="muted small">O limite de orçamento desta categoria também será removido.</p>}
      <button
        className="button button--danger"
        type="submit"
        disabled={remove.submitting || (entriesMessage !== null && moveTo === '')}
      >
        {remove.submitting ? 'Excluindo…' : entriesMessage ? 'Mover e excluir' : 'Excluir'}
      </button>
      <button className="button button--ghost" type="button" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}
