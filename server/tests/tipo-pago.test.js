import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function periodoConDosRoles() {
  const s = Date.now();
  const { rows: p } = await pool.query(
    `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena,estado)
     VALUES ('tp ${s}','2026-11-01','2026-11-15',1,'BORRADOR') RETURNING id`);
  const mk = async (nombre, ced, tipo_pago) => {
    const { rows: c } = await pool.query(
      `INSERT INTO colaboradores (tipo,nombre,cedula,empresa,clasificacion,cuenta_bancaria,tipo_cuenta,codigo_banco)
       VALUES ('IESS',$1,$2,'BOPELUAL S.A.','COMERCIAL','2205467800','AHORRO','10') RETURNING id`, [nombre, ced]);
    const { rows: r } = await pool.query(
      `INSERT INTO roles_pago (periodo_id,colaborador_id,neto,tipo_pago) VALUES ($1,$2,100,$3) RETURNING id`,
      [p[0].id, c[0].id, tipo_pago]);
    return r[0].id;
  };
  const transf = await mk(`TRANSF ${s}`, `t${s % 1e8}`, 'TRANSFERENCIA');
  const cheque = await mk(`CHEQUE ${s}`, `q${s % 1e8}`, 'CHEQUE');
  return { periodoId: p[0].id, transf, cheque };
}

describe('tipo_pago por rol', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('el TXT solo incluye Transferencia', async () => {
    const app = createApp();
    const { periodoId } = await periodoConDosRoles();
    const txt = await auth(request(app).get(`/api/periodos/${periodoId}/txt-pago`));
    expect(txt.body.incluidos).toBe(1);
    expect(txt.body.contenido).toContain('TRANSF');
    expect(txt.body.contenido).not.toContain('CHEQUE');
  });

  it('PATCH tipo-pago cambia el valor y valida', async () => {
    const app = createApp();
    const { periodoId, transf } = await periodoConDosRoles();
    const ok = await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${transf}/tipo-pago`))
      .send({ tipo_pago: 'PENDIENTE' });
    expect(ok.status).toBe(200);
    expect(ok.body.tipo_pago).toBe('PENDIENTE');
    // ahora el TXT ya no lo incluye
    const txt = await auth(request(app).get(`/api/periodos/${periodoId}/txt-pago`));
    expect(txt.body.incluidos).toBe(0);
    const bad = await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${transf}/tipo-pago`))
      .send({ tipo_pago: 'EFECTIVO' });
    expect(bad.status).toBe(400);
  });

  it('el Excel incluye a todos y suma (Pendiente incluido)', async () => {
    const app = createApp();
    const { periodoId, transf } = await periodoConDosRoles();
    await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${transf}/tipo-pago`))
      .send({ tipo_pago: 'PENDIENTE' });
    const excel = await auth(request(app).get(`/api/periodos/${periodoId}/excel`));
    expect(excel.body.incluidos).toBe(2);
    expect(excel.body.total).toBe(200);
  });
});
