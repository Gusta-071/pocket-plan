import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('responde que a API e o banco estão disponíveis', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('responde 404 padronizado para rotas inexistentes da API', async () => {
    const response = await request(createApp()).get('/api/nao-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 400 para JSON malformado, e não erro do servidor', async () => {
    const response = await request(createApp())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{oops');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('responde 413 para corpo grande demais', async () => {
    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(200_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
