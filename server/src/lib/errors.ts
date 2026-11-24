import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** Erro de regra de negócio ou de requisição, com status HTTP e código estável. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  /** Erros ligados a campos do formulário, no mesmo formato da validação. */
  readonly fields?: { path: string; message: string }[];

  constructor(status: number, code: string, message: string, fields?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        fields: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }
  // Erros do leitor de JSON do Express: corpo malformado (400) ou grande demais (413).
  // São erros de quem fez a requisição, não do servidor.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'O corpo da requisição é grande demais.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado no servidor.' } });
};
