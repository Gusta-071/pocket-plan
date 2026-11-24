import { useCallback, useEffect, useState } from 'react';
import { Alert, Field } from '../components/Form';
import { Sheet } from '../components/Sheet';
import { api, ApiError } from '../lib/api';
import { CATEGORY_COLORS, TYPE_LABELS, type Category, type CategoryColor, type CategoryType } from '../lib/categories';
import { useSubmit } from '../lib/useSubmit';

const MAX_PER_TYPE = 30; // RN-16b

type Editing = { mode: 'create'; type: CategoryType } | { mode: 'edit'; category: Category } | null;

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [editing, setEditing] = useState<Editing>(null);

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

  const visible = categories?.filter((category) => category.type === type) ?? [];
  const sameType = (category: Category) => categories?.filter((c) => c.type === category.type) ?? [];

  function closeAndReload() {
    setEditing(null);
    void load();
  }

  return (
    <>
      <div className="page-header">
        <h1>Categorias</h1>
        <button
          className="button"
          type="button"
          onClick={() => setEditing({ mode: 'create', type })}
          disabled={!categories || visible.length >= MAX_PER_TYPE}
        >
          + Nova
        </button>
      </div>

      <div className="segmented" role="tablist" aria-label="Tipo de categoria">
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

      {categories && (
        <>
          <ul className="list" aria-label={TYPE_LABELS[type].plural}>
            {visible.map((category) => (
              <li key={category.id}>
                <button type="button" className="list__item" onClick={() => setEditing({ mode: 'edit', category })}>
                  <span className="color-dot" style={{ background: CATEGORY_COLORS[category.color].hex }} aria-hidden="true" />
                  <span className="list__label">{category.name}</span>
                  <span className="list__action" aria-hidden="true">
                    Editar
                  </span>
                  <span className="visually-hidden">, editar</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {visible.length} de {MAX_PER_TYPE} categorias de {TYPE_LABELS[type].singular}.
          </p>
        </>
      )}

      {editing?.mode === 'create' && (
        <CategorySheet type={editing.type} onClose={() => setEditing(null)} onSaved={closeAndReload} />
      )}
      {editing?.mode === 'edit' && (
        <CategorySheet
          type={editing.category.type}
          category={editing.category}
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
  onClose: () => void;
  onSaved: () => void;
};

function CategorySheet({ type, category, siblings = [], onClose, onSaved }: SheetProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<CategoryColor>(category?.color ?? 'blue');
  const [deleting, setDeleting] = useState(false);

  const save = useSubmit(async () => {
    if (category) {
      await api(`/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name, color }) });
    } else {
      await api('/categories', { method: 'POST', body: JSON.stringify({ type, name, color }) });
    }
    onSaved();
  });

  const typeLabel = TYPE_LABELS[type].singular;

  if (category && deleting) {
    return (
      <Sheet title="Excluir categoria" onClose={onClose}>
        <DeleteCategory category={category} siblings={siblings} onCancel={() => setDeleting(false)} onDeleted={onSaved} />
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
  onCancel,
  onDeleted,
}: {
  category: Category;
  siblings: Category[];
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
