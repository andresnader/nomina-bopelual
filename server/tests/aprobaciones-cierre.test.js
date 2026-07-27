import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('aprobar período aprueba en bloque sus grupos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('tras aprobar el período, todos sus grupos quedan aprobados', async () => {
    const app = createApp();
    const s = Date.now();
    const { rows: p } = await pool.query(
      `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena)
       VALUES ('bulk ${s}','2026-08-01','2026-08-15',1) RETURNING id`);
    const { rows: c } = await pool.query(
      `INSERT INTO colaboradores (tipo,nombre,cedula,empresa,clasificacion)
       VALUES ('IESS','BULK ${s}','B${s % 1e8}','BOPELUAL S.A.','COMERCIAL') RETURNING id`);
    await pool.query(`INSERT INTO roles_pago (periodo_id,colaborador_id,neto) VALUES ($1,$2,10)`,
      [p[0].id, c[0].id]);

    const ap = await auth(request(app).post(`/api/periodos/${p[0].id}/aprobar`));
    expect(ap.status).toBe(200);
    expect(ap.body.estado).toBe('APROBADO');

    const det = await auth(request(app).get(`/api/periodos/${p[0].id}`));
    expect(det.body.grupos.find((g) => g.grupo === 'COMERCIAL').aprobado).toBe(true);
  });
});
