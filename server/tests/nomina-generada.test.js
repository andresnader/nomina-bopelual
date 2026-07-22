import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearPeriodoConRoles() {
  const sello = Date.now();
  const { rows: per } = await pool.query(
    `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
     VALUES ('Nómina gen ${sello}','2026-10-01','2026-10-15',1,'APROBADO') RETURNING id`
  );
  const { rows: colA } = await pool.query(
    `INSERT INTO colaboradores (tipo, cedula, nombre, empresa, cuenta_bancaria, tipo_cuenta, codigo_banco)
     VALUES ('IESS','07${sello % 1e8}','PAGA TXT','BOPELUAL S.A.','2205467800','AHORRO','10') RETURNING id`
  );
  const { rows: colB } = await pool.query(
    `INSERT INTO colaboradores (tipo, cedula, nombre, empresa, cuenta_bancaria, tipo_cuenta, codigo_banco)
     VALUES ('IESS','06${sello % 1e8}','PAGA CHEQUE','BOPELUAL S.A.','2205467811','AHORRO','10') RETURNING id`
  );
  const { rows: roles } = await pool.query(
    `INSERT INTO roles_pago (periodo_id, colaborador_id, total_ingresos, total_descuentos, neto)
     VALUES ($1,$2,200,10,190), ($1,$3,150,0,150) RETURNING id`,
    [per[0].id, colA[0].id, colB[0].id]
  );
  await pool.query(
    `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion)
     VALUES ($1,'SUELDO_BASE','INGRESO',200,'Sueldo'), ($2,'SUELDO_BASE','INGRESO',150,'Sueldo')`,
    [roles[0].id, roles[1].id]
  );
  return { periodoId: per[0].id, rolTxt: roles[0].id, rolCheque: roles[1].id };
}

describe('nómina generada: marca TXT, Excel y aprobar/cerrar', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('PATCH incluir-txt marca/desmarca un rol y valida entrada', async () => {
    const app = createApp();
    const { periodoId, rolTxt } = await crearPeriodoConRoles();

    const off = await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${rolTxt}/incluir-txt`))
      .send({ incluir: false });
    expect(off.status).toBe(200);
    expect(off.body.incluir_en_txt).toBe(false);

    // persiste al recargar el período
    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    expect(det.body.roles_pago.find((r) => r.id === rolTxt).incluir_en_txt).toBe(false);
    // el otro rol sigue marcado por defecto
    expect(det.body.roles_pago.find((r) => r.id !== rolTxt).incluir_en_txt).toBe(true);

    const on = await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${rolTxt}/incluir-txt`))
      .send({ incluir: true });
    expect(on.body.incluir_en_txt).toBe(true);

    const malBody = await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${rolTxt}/incluir-txt`))
      .send({ incluir: 'si' });
    expect(malBody.status).toBe(400);
    const otroPeriodo = await auth(request(app).patch(`/api/periodos/00000000-0000-0000-0000-000000000000/roles/${rolTxt}/incluir-txt`))
      .send({ incluir: false });
    expect(otroPeriodo.status).toBe(404);
  });

  it('el TXT excluye a los desmarcados; el Excel incluye a todos', async () => {
    const app = createApp();
    const { periodoId, rolCheque } = await crearPeriodoConRoles();

    await auth(request(app).patch(`/api/periodos/${periodoId}/roles/${rolCheque}/incluir-txt`))
      .send({ incluir: false });

    const txt = await auth(request(app).get(`/api/periodos/${periodoId}/txt-pago`));
    expect(txt.status).toBe(200);
    expect(txt.body.incluidos).toBe(1);
    expect(txt.body.total).toBe(190);
    expect(txt.body.contenido).toContain('PAGA TXT');
    expect(txt.body.contenido).not.toContain('PAGA CHEQUE');
    // los desmarcados no aparecen ni como excluidos: se pagan por otro medio
    expect(txt.body.excluidos).toHaveLength(0);

    const excel = await auth(request(app).get(`/api/periodos/${periodoId}/excel`));
    expect(excel.status).toBe(200);
    expect(excel.body.incluidos).toBe(2);
    expect(excel.body.total).toBe(340);
    expect(excel.body.archivo).toMatch(/^nomina_.*\.xlsx$/);
    const buffer = Buffer.from(excel.body.contenidoBase64, 'base64');
    // un .xlsx es un zip: empieza con PK
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('un usuario ADMIN también puede aprobar y cerrar el período', async () => {
    await pool.query(`UPDATE usuarios SET rol='ADMIN' WHERE email='rrhh@bopelual.com'`);
    const app = createApp();

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `admin cierra ${Date.now()}`, fecha_inicio: '2027-03-01', fecha_fin: '2027-03-15', quincena: 1
    });
    expect(per.status).toBe(201);
    const id = per.body.periodo.id;

    const aprob = await auth(request(app).post(`/api/periodos/${id}/aprobar`));
    expect(aprob.status).toBe(200);
    expect(aprob.body.estado).toBe('APROBADO');

    const cierre = await auth(request(app).post(`/api/periodos/${id}/cerrar`));
    expect(cierre.status).toBe(200);
    expect(cierre.body.estado).toBe('CERRADO');
    expect(cierre.body.cerrado_en).toBeTruthy();
  });
});
