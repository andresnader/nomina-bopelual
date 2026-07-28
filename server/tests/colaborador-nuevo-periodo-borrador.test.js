import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('colaborador nuevo con período en BORRADOR', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('se agrega automáticamente al período en BORRADOR al crear su contrato', async () => {
    const app = createApp();
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `borrador nuevo ${Date.now()}`, fecha_inicio: '2027-05-01', fecha_fin: '2027-05-15', quincena: 1
    });
    const periodoId = per.body.periodo.id;

    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Nuevo ${Date.now()}`, cedula: `NU${Date.now() % 1e8}`
    })).body;
    const contrato = await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2027-05-01'
    });
    expect(contrato.status).toBe(201);
    // >=1 y no ===1: la suite corre en paralelo sobre una sola BD, así que
    // puede haber otros períodos en BORRADOR de otros tests al mismo tiempo.
    expect(contrato.body.periodos_borrador_agregado).toBeGreaterThanOrEqual(1);

    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    expect(rol).toBeTruthy();
  });

  it('prorratea el ingreso de un colaborador IESS que entra a mitad de quincena', async () => {
    const app = createApp();
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `prorrateo iess ${Date.now()}`, fecha_inicio: '2027-05-01', fecha_fin: '2027-05-15', quincena: 1
    });
    const periodoId = per.body.periodo.id;

    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Prorrateo ${Date.now()}`, cedula: `PR${Date.now() % 1e8}`,
      fecha_ingreso: '2027-05-10'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2027-05-10'
    });

    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const rolDetalle = await auth(request(app).get(`/api/roles/${rol.id}`));
    const anticipo = rolDetalle.body.lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA');
    // Sueldo 1000, anticipo 40% = 400 sin prorratear; ingresó el día 10 de una
    // quincena de 15 días → 6 días trabajados → factor 0.4 → 400*0.4 = 160.
    expect(Number(anticipo.monto)).toBeCloseTo(160, 2);
  });

  it('NO prorratea el ingreso de un colaborador EXTERNO aunque entre a mitad de quincena', async () => {
    const app = createApp();
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sin prorrateo externo ${Date.now()}`, fecha_inicio: '2027-05-01', fecha_fin: '2027-05-15', quincena: 1
    });
    const periodoId = per.body.periodo.id;

    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'EXTERNO', nombre: `Externo ${Date.now()}`, cedula: `EX${Date.now() % 1e8}`,
      fecha_ingreso: '2027-05-10'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2027-05-10'
    });

    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const rolDetalle = await auth(request(app).get(`/api/roles/${rol.id}`));
    const anticipo = rolDetalle.body.lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA');
    // Sueldo 1000, EXTERNO sin pct_anticipo propio usa el default de 50%
    // (PORCENTAJE_ANTICIPO_EXTERNO) en vez del 40% global — sin prorrateo.
    expect(Number(anticipo.monto)).toBe(500);
  });

  it('no duplica el rol si el colaborador ya tenía uno en ese período (aumento de sueldo)', async () => {
    const app = createApp();
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sin duplicar ${Date.now()}`, fecha_inicio: '2027-05-01', fecha_fin: '2027-05-15', quincena: 1
    });
    const periodoId = per.body.periodo.id;

    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Aumento ${Date.now()}`, cedula: `AU${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2027-04-01'
    });
    // Aumento de sueldo posterior: ya tenía rol en este período BORRADOR, así
    // que no debe duplicarse (sin importar cuántos otros períodos en BORRADOR
    // de otros tests concurrentes existan en la BD compartida).
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1200, fecha_inicio: '2027-05-02'
    });

    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const roles = det.body.roles_pago.filter((r) => r.colaborador_id === col.id);
    expect(roles.length).toBe(1);
  });
});
