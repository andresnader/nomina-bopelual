import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const identidad = { email: 'rrhh@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearContrato(app) {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Extra ${Date.now()}`, cedula: `EX${Date.now() % 1e8}`
    })
  ).body;
  const creado = (
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 600, fecha_inicio: '2026-01-01'
    })
  ).body;
  // POST /contratos no acepta fecha_fin (solo lo hace el PATCH agregado en esta misma tanda de cambios).
  const contrato = (
    await auth(request(app).patch(`/api/colaboradores/${col.id}/contratos/${creado.id}`)).send({
      fecha_fin: '2026-08-01'
    })
  ).body;
  return { col, contrato };
}

describe('contratos próximos a vencer / PATCH contrato', () => {
  beforeEach(async () => {
    identidad.email = 'rrhh@bopelual.com';
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('GET /contratos/proximos-vencer lista contratos con fecha_fin próxima; RRHH puede leer', async () => {
    const app = createApp();
    const { contrato } = await crearContrato(app);

    const res = await auth(request(app).get('/api/contratos/proximos-vencer'));
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.id === contrato.id)).toBe(true);
  });

  it('PATCH /colaboradores/:id/contratos/:id actualiza campos permitidos; RRHH puede', async () => {
    const app = createApp();
    const { col, contrato } = await crearContrato(app);

    const res = await auth(
      request(app).patch(`/api/colaboradores/${col.id}/contratos/${contrato.id}`)
    ).send({ notas: 'renovado' });
    expect(res.status).toBe(200);
    expect(res.body.notas).toBe('renovado');
  });

  it('un COLABORADOR no puede leer próximos a vencer ni editar contratos (403)', async () => {
    const app = createApp();
    const { col, contrato } = await crearContrato(app);
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('empleado1@bopelual.com','COLABORADOR')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='COLABORADOR'`);
    identidad.email = 'empleado1@bopelual.com';

    const lista = await auth(request(app).get('/api/contratos/proximos-vencer'));
    expect(lista.status).toBe(403);

    const patch = await auth(
      request(app).patch(`/api/colaboradores/${col.id}/contratos/${contrato.id}`)
    ).send({ sueldo_base: 9999 });
    expect(patch.status).toBe(403);
  });
});
