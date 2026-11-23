export type ApiErrorBody = {
  error: { code: string; message: string; fields?: { path: string; message: string }[] };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Mensagem de validação por campo (ex.: `{ password: 'A senha deve ter...' }`). */
  readonly fields: Record<string, string>;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error.message ?? 'Não foi possível falar com o servidor.');
    this.status = status;
    this.code = body?.error.code ?? 'NETWORK_ERROR';
    this.fields = {};
    for (const field of body?.error.fields ?? []) this.fields[field.path] ??= field.message;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, null);
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body as ApiErrorBody | null);
  return body as T;
}
