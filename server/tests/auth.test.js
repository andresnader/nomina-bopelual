import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async (t) => {
    if (t === 'valido') return { email: 'ana@bopelual.com', nombre: 'Ana' };
    throw new Error('inválido');
  })
}));

// Import DESPUÉS del mock para que createApp use la versión mockeada.
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;

describe('auth', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, nombre, rol) VALUES
      ('ana@bopelual.com','Ana','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('401 sin token', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 con token inválido', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer malo');
    console.log('RES PARA MALO:', res.status, res.body);
    expect(res.status).toBe(401);
  });

  it('200 y devuelve el usuario con token válido', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer valido');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ana@bopelual.com');
    expect(res.body.rol).toBe('RRHH');
  });

  it('403 si el email no está en usuarios activos', async () => {
    await pool.query(`UPDATE usuarios SET activo=false WHERE email='ana@bopelual.com'`);
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer valido');
    expect(res.status).toBe(403);
  });
});
