import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const identidad = { email: 'admin@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('catálogo de tipos de contrato', () => {
  beforeEach(async () => {
    identidad.email = 'admin@bopelual.com';
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('viene sembrado con los 5 tipos reales del Código de Trabajo', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/tipos-contrato'));
    expect(res.status).toBe(200);
    const codigos = res.body.map((t) => t.codigo);
    expect(codigos).toEqual(expect.arrayContaining([
      'PRODUCTIVO', 'INDEFINIDO', 'ESPECIAL_EMERGENTE', 'JUVENIL', 'TEMPORAL'
    ]));
  });

  it('GET / oculta inactivos; GET /todos (ADMIN) los muestra', async () => {
    const app = createApp();
    await auth(request(app).patch('/api/tipos-contrato/TEMPORAL')).send({ activo: false });

    const activos = await auth(request(app).get('/api/tipos-contrato'));
    expect(activos.body.some((t) => t.codigo === 'TEMPORAL')).toBe(false);

    const todos = await auth(request(app).get('/api/tipos-contrato/todos'));
    expect(todos.body.some((t) => t.codigo === 'TEMPORAL')).toBe(true);

    await auth(request(app).patch('/api/tipos-contrato/TEMPORAL')).send({ activo: true }); // restaurar
  });

  it('solo ADMIN gestiona; RRHH puede leer pero no crear', async () => {
    const app = createApp();
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh3@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
    identidad.email = 'rrhh3@bopelual.com';

    const lectura = await auth(request(app).get('/api/tipos-contrato'));
    expect(lectura.status).toBe(200);

    const prohibido = await auth(request(app).post('/api/tipos-contrato')).send({ codigo: 'X', nombre: 'X' });
    expect(prohibido.status).toBe(403);
  });

  it('POST /colaboradores/:id/contratos valida tipo_contrato contra el catálogo', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `TipoContrato ${Date.now()}`, cedula: `TC2${Date.now() % 1e8}`
      })
    ).body;

    const invalido = await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01', tipo_contrato: 'INVENTADO'
    });
    expect(invalido.status).toBe(400);

    const valido = await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01', tipo_contrato: 'JUVENIL'
    });
    expect(valido.status).toBe(201);
    expect(valido.body.tipo_contrato).toBe('JUVENIL');
  });
});
