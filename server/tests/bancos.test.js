import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const identidad = { email: 'admin@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('catálogo de bancos', () => {
  beforeEach(async () => {
    identidad.email = 'admin@bopelual.com';
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('viene sembrado desde el PDF con los códigos verificados contra los TXT', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/bancos'));
    expect(res.body.length).toBeGreaterThan(400);
    const codigo = (c) => res.body.find((b) => b.codigo === c)?.nombre;
    expect(codigo('10')).toMatch(/PICHINCHA/);
    expect(codigo('17')).toMatch(/GUAYAQUIL/);
    expect(codigo('30')).toMatch(/PACIFICO/);
    expect(codigo('36')).toMatch(/PRODUBANCO/);
    expect(codigo('37')).toMatch(/BOLIVARIANO/);
  });

  it('busca por nombre o código y oculta inactivos', async () => {
    const app = createApp();
    const busqueda = await auth(request(app).get('/api/bancos?q=BOLIVARIANO'));
    expect(busqueda.body.some((b) => b.codigo === '37')).toBe(true);

    await auth(request(app).patch('/api/bancos/37')).send({ activo: false });
    const sinInactivo = await auth(request(app).get('/api/bancos'));
    expect(sinInactivo.body.some((b) => b.codigo === '37')).toBe(false);
    await auth(request(app).patch('/api/bancos/37')).send({ activo: true }); // restaurar
  });

  it('solo ADMIN gestiona; el alta valida código numérico y duplicados', async () => {
    const app = createApp();
    const nuevo = await auth(request(app).post('/api/bancos')).send({ codigo: '9999', nombre: 'banco de prueba' });
    if (nuevo.status === 201) expect(nuevo.body.nombre).toBe('BANCO DE PRUEBA');
    else expect(nuevo.status).toBe(409); // ya existía de una corrida anterior

    const duplicado = await auth(request(app).post('/api/bancos')).send({ codigo: '10', nombre: 'X' });
    expect(duplicado.status).toBe(409);
    const invalido = await auth(request(app).post('/api/bancos')).send({ codigo: 'ABC', nombre: 'X' });
    expect(invalido.status).toBe(400);

    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh2@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
    identidad.email = 'rrhh2@bopelual.com';
    const prohibido = await auth(request(app).post('/api/bancos')).send({ codigo: '8888', nombre: 'X' });
    expect(prohibido.status).toBe(403);
  });
});
