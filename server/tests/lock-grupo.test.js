import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('bloqueo de edición por grupo aprobado', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('no permite agregar línea a un rol de grupo aprobado', async () => {
    const app = createApp();
    const s = Date.now();
    const { rows: p } = await pool.query(
      `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena)
       VALUES ('lock ${s}','2021-09-01','2021-09-15',1) RETURNING id`);
    const { rows: c } = await pool.query(
      `INSERT INTO colaboradores (tipo,nombre,cedula,empresa,clasificacion)
       VALUES ('IESS','LOCK ${s}','L${s%1e8}','BOPELUAL S.A.','COMERCIAL') RETURNING id`);
    const { rows: rol } = await pool.query(
      `INSERT INTO roles_pago (periodo_id,colaborador_id,neto) VALUES ($1,$2,0) RETURNING id`,
      [p[0].id, c[0].id]);

    // editable antes de aprobar el grupo
    const ok = await auth(request(app).post(`/api/roles/${rol[0].id}/lineas`))
      .send({ tipo_linea: 'BONO', clase: 'INGRESO', monto: 10 });
    expect(ok.status).toBe(201);

    await auth(request(app).post(`/api/periodos/${p[0].id}/combinaciones/aprobar`))
      .send({ empresa: 'BOPELUAL S.A.', tipo: 'IESS', clasificacion: 'COMERCIAL' });

    const bloqueado = await auth(request(app).post(`/api/roles/${rol[0].id}/lineas`))
      .send({ tipo_linea: 'BONO', clase: 'INGRESO', monto: 5 });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.error).toMatch(/combinación aprobada/);
  });
});
