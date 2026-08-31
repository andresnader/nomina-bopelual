import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// GET /roles/:id de una 2da quincena debe traer un resumen de solo lectura
// de la 1ra quincena hermana (lo que ya se pagó y descontó ahí), para que
// quien está revisando/editando la 2da quincena no tenga que salir de la
// pantalla a buscarlo manualmente.
describe('GET /roles/:id — quincenaAnterior', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  async function crearMesConAmbasQuincenas(app, { nombreCol, sueldoBase, q1Inicio, q1Fin, q2Inicio, q2Fin, mesInicio, mesFin }) {
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: nombreCol, cedula: `QA${Date.now() % 1e8}`, fecha_ingreso: '2020-01-01'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: sueldoBase, fecha_inicio: '2020-01-01'
    });
    const mes = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado)
       VALUES ($1,$2,$3,'AMBAS','MES','BORRADOR') RETURNING id`,
      [`Mes QA ${Date.now()}`, mesInicio, mesFin]
    );
    const mesId = mes.rows[0].id;
    const q1 = await auth(request(app).post('/api/periodos')).send({
      nombre: `1ra QA ${Date.now()}`, fecha_inicio: q1Inicio, fecha_fin: q1Fin, quincena: 1
    });
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da QA ${Date.now()}`, fecha_inicio: q2Inicio, fecha_fin: q2Fin, quincena: 2
    });
    await pool.query(`UPDATE periodos SET mes_periodo_id=$1 WHERE id IN ($2,$3)`, [mesId, q1.body.periodo.id, q2.body.periodo.id]);

    const detQ1 = await auth(request(app).get(`/api/periodos/${q1.body.periodo.id}`));
    const detQ2 = await auth(request(app).get(`/api/periodos/${q2.body.periodo.id}`));
    const rolQ1 = detQ1.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const rolQ2 = detQ2.body.roles_pago.find((r) => r.colaborador_id === col.id);
    return { col, rolQ1, rolQ2 };
  }

  it('en una 2da quincena, trae quincenaAnterior con el desglose completo de la 1ra', async () => {
    const app = createApp();
    const { rolQ1, rolQ2 } = await crearMesConAmbasQuincenas(app, {
      nombreCol: `QuincenaAnterior ${Date.now()}`, sueldoBase: 2000,
      mesInicio: '2027-10-01', mesFin: '2027-10-31',
      q1Inicio: '2027-10-01', q1Fin: '2027-10-15',
      q2Inicio: '2027-10-16', q2Fin: '2027-10-31'
    });

    const res = await auth(request(app).get(`/api/roles/${rolQ2.id}`));
    expect(res.status).toBe(200);
    expect(res.body.quincenaAnterior).toBeTruthy();
    expect(res.body.quincenaAnterior.periodo_estado).toBe('BORRADOR');
    expect(Number(res.body.quincenaAnterior.neto)).toBeCloseTo(Number(rolQ1.neto), 2);
    expect(res.body.quincenaAnterior.lineas.length).toBeGreaterThan(0);
    expect(res.body.quincenaAnterior.lineas.some((l) => l.tipo_linea === 'ANTICIPO_QUINCENA')).toBe(true);
  });

  it('en una 1ra quincena, no trae quincenaAnterior (no hay "anterior" antes de la 1ra)', async () => {
    const app = createApp();
    const { rolQ1 } = await crearMesConAmbasQuincenas(app, {
      nombreCol: `QuincenaAnterior1ra ${Date.now()}`, sueldoBase: 2000,
      mesInicio: '2027-09-01', mesFin: '2027-09-30',
      q1Inicio: '2027-09-01', q1Fin: '2027-09-15',
      q2Inicio: '2027-09-16', q2Fin: '2027-09-30'
    });

    const res = await auth(request(app).get(`/api/roles/${rolQ1.id}`));
    expect(res.status).toBe(200);
    expect(res.body.quincenaAnterior).toBeUndefined();
  });

  it('en una 2da quincena sin hermana de 1ra, no rompe y no trae quincenaAnterior', async () => {
    const app = createApp();
    // fecha_ingreso justo al inicio de esta 2da quincena (no en el pasado
    // lejano): así el colaborador no queda elegible para que
    // agregarColaboradorAPeriodosBorrador lo sume retroactivamente a algún
    // período BORRADOR de 1ra quincena ajeno que ande cerca en fecha en la
    // BD compartida de tests, lo cual falsearía este caso "sin hermana".
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `QuincenaAnteriorSinHermana ${Date.now()}`, cedula: `QAS${Date.now() % 1e8}`, fecha_ingreso: '2027-08-16'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 2000, fecha_inicio: '2020-01-01'
    });
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da suelta QA ${Date.now()}`, fecha_inicio: '2027-08-16', fecha_fin: '2027-08-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${q2.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const res = await auth(request(app).get(`/api/roles/${rol.id}`));
    expect(res.status).toBe(200);
    expect(res.body.quincenaAnterior).toBeUndefined();
  });
});
