import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaborador(app) {
  const res = await auth(request(app).post('/api/colaboradores')).send({
    tipo: 'IESS',
    nombre: `Ausencias test ${Date.now()}`,
    cedula: `AU${Date.now() % 1e9}`,
  });
  return res.body;
}

describe('ausencias', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('PATCH edita una ausencia SOLICITADA y recalcula los días', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const creada = (
      await auth(request(app).post('/api/ausencias')).send({
        colaborador_id: col.id, tipo: 'VACACIONES', fecha_desde: '2026-08-01', fecha_hasta: '2026-08-05'
      })
    ).body;
    expect(Number(creada.dias)).toBe(5);

    const editada = await auth(request(app).patch(`/api/ausencias/${creada.id}`)).send({
      fecha_desde: '2026-08-01', fecha_hasta: '2026-08-10'
    });
    expect(editada.status).toBe(200);
    expect(Number(editada.body.dias)).toBe(10);
    expect(editada.body.fecha_hasta.slice(0, 10)).toBe('2026-08-10');
  });

  it('PATCH sobre una ausencia ya decidida responde 409', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const creada = (
      await auth(request(app).post('/api/ausencias')).send({
        colaborador_id: col.id, tipo: 'PERMISO', fecha_desde: '2026-09-01', fecha_hasta: '2026-09-01'
      })
    ).body;
    await auth(request(app).post(`/api/ausencias/${creada.id}/aprobar`));

    const res = await auth(request(app).patch(`/api/ausencias/${creada.id}`)).send({ motivo: 'cambio' });
    expect(res.status).toBe(409);
  });
});
