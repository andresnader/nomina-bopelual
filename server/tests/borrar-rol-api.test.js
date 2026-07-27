import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('DELETE rol manual', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('borra el rol de un período en BORRADOR', async () => {
    const app = createApp();
    const s = Date.now();
    const { rows: p } = await pool.query(
      `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena)
       VALUES ('del ${s}','2026-10-01','2026-10-15',1) RETURNING id`);
    const { rows: c } = await pool.query(
      `INSERT INTO colaboradores (tipo,nombre,cedula,empresa,clasificacion)
       VALUES ('IESS','DEL ${s}','D${s % 1e8}','BOPELUAL S.A.','COMERCIAL') RETURNING id`);
    const { rows: rol } = await pool.query(
      `INSERT INTO roles_pago (periodo_id,colaborador_id,neto) VALUES ($1,$2,0) RETURNING id`,
      [p[0].id, c[0].id]);

    const del = await auth(request(app).delete(`/api/periodos/${p[0].id}/roles/${rol[0].id}`));
    expect(del.status).toBe(200);
    const { rows: after } = await pool.query('SELECT 1 FROM roles_pago WHERE id=$1', [rol[0].id]);
    expect(after).toHaveLength(0);
  });
});
