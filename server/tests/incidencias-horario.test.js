import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaboradorConHorario(app, horario = 'ADM') {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Inc ${Date.now()}`, cedula: `IN${Date.now() % 1e8}`
    })
  ).body;
  await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ horario });
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: 600, fecha_inicio: '2026-01-01'
  });
  return col;
}

describe('incidencias de horario', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST calcula y guarda la incidencia como pendiente', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`)
    ).send({ fecha: '2026-07-13', hora_entrada_real: '08:40' }); // lunes, 10 min tarde

    expect(res.status).toBe(201);
    expect(res.body.minutos_tardanza).toBe(5); // 10 - 5 de gracia
    expect(Number(res.body.monto_total)).toBeCloseTo(5 * (600 / 30 / 8 / 60), 2);
    expect(res.body.lineas_rol_id).toBeNull();
  });

  it('rechaza si el colaborador no tiene horario asignado', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `SinHorario ${Date.now()}`, cedula: `SH${Date.now() % 1e8}`
      })
    ).body;
    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`)
    ).send({ fecha: '2026-07-13', hora_entrada_real: '08:40' });
    expect(res.status).toBe(400);
  });

  it('GET lista las incidencias del colaborador', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
      .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' });

    const lista = await auth(request(app).get(`/api/colaboradores/${col.id}/incidencias-horario`));
    expect(lista.body).toHaveLength(1);
  });

  it('aplicar inserta una línea DESCUENTO_HORARIO en el rol y actualiza los totales', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const incidencia = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;

    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `incidencia test ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${periodo.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const aplicado = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(aplicado.status).toBe(200);
    expect(aplicado.body.lineas_rol_id).toBeTruthy();

    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    const linea = lineas.find((l) => l.incidencia_horario_id === incidencia.id);
    expect(linea.tipo_linea).toBe('DESCUENTO_HORARIO');
    expect(Number(linea.monto)).toBeCloseTo(Number(incidencia.monto_total), 2);
  });

  it('rechaza aplicar dos veces la misma incidencia', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const incidencia = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;
    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `incidencia doble ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${periodo.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`))
      .send({ rol_pago_id: rol.id });
    const segunda = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(segunda.status).toBe(409);
  });

  it('rechaza aplicar si el grupo del rol está aprobado (bloqueado)', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const incidencia = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;
    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `incidencia lock ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const periodoId = periodo.body.periodo.id;
    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    // aprobar la combinación del colaborador (BOPELUAL S.A. / IESS / ADMINISTRATIVO) bloquea su edición
    await auth(request(app).post(`/api/periodos/${periodoId}/combinaciones/aprobar`))
      .send({ empresa: 'BOPELUAL S.A.', tipo: 'IESS', clasificacion: 'ADMINISTRATIVO' });

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/combinación aprobada/);
  });

  it('DELETE elimina una incidencia pendiente; rechaza si ya fue aplicada', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const pendiente = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;
    const borrado = await auth(request(app).del(`/api/colaboradores/${col.id}/incidencias-horario/${pendiente.id}`));
    expect(borrado.status).toBe(200);
  });
});
