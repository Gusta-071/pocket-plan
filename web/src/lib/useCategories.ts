import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Category } from './categories';

/** Categorias do usuário, carregadas da API. */
export function useCategories() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await api<{ categories: Category[] }>('/categories');
      setCategories(result.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as categorias.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { categories, error, reload };
}
