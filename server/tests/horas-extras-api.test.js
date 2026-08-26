import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaborador(app, sueldoBase = 482) {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `HE ${Date.now()}`, cedula: `HE${Date.now() % 1e8}`,
      fecha_ingreso: '2020-01-01'
    })
  ).body;
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: sueldoBase, fecha_inicio: '2026-01-01'
  });
  return col;
}

describe('horas extras', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST calcula y guarda la hora extra como pendiente (día laborable = SUPLEMENTARIA)', async () => {
    const app = createApp();
    const col = await crearColaborador(app);

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/horas-extras`)
    ).send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' }); // lunes

    expect(res.status).toBe(201);
    expect(res.body.tipo_hora).toBe('SUPLEMENTARIA');
    expect(Number(res.body.monto_total)).toBeCloseTo((133 / 60) * (482 / 240) * 1.5, 2);
    expect(res.body.lineas_rol_id).toBeNull();
  });

  it('POST clasifica fin de semana como EXTRAORDINARIA', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/horas-extras`)
    ).send({ fecha: '2026-08-08', hora_entrada: '07:00', hora_salida: '11:52' }); // sábado
    expect(res.body.tipo_hora).toBe('EXTRAORDINARIA');
  });

  it('rechaza si no hay contrato vigente en esa fecha', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `SinContrato ${Date.now()}`, cedula: `SC${Date.now() % 1e8}`
      })
    ).body;
    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/horas-extras`)
    ).send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' });
    expect(res.status).toBe(400);
  });

  it('GET lista las horas extras del colaborador', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    await auth(request(app).post(`/api/colaboradores/${col.id}/horas-extras`))
      .send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' });
    const lista = await auth(request(app).get(`/api/colaboradores/${col.id}/horas-extras`));
    expect(lista.body).toHaveLength(1);
  });

  it('aplicar inserta una línea HORAS_EXTRAS de INGRESO en el rol y actualiza los totales', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const he = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/horas-extras`))
        .send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' })
    ).body;

    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `horas extras test ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${periodo.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const aplicado = await auth(
      request(app).post(`/api/colaboradores/${col.id}/horas-extras/${he.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(aplicado.status).toBe(200);
    expect(aplicado.body.lineas_rol_id).toBeTruthy();

    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    const linea = lineas.find((l) => l.horas_extras_id === he.id);
    expect(linea.tipo_linea).toBe('HORAS_EXTRAS');
    expect(linea.clase).toBe('INGRESO');
    expect(Number(linea.monto)).toBeCloseTo(Number(he.monto_total), 2);
  });

  it('rechaza aplicar dos veces la misma hora extra', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const he = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/horas-extras`))
        .send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' })
    ).body;
    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `horas extras doble ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${periodo.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    await auth(request(app).post(`/api/colaboradores/${col.id}/horas-extras/${he.id}/aplicar`))
      .send({ rol_pago_id: rol.id });
    const segunda = await auth(
      request(app).post(`/api/colaboradores/${col.id}/horas-extras/${he.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(segunda.status).toBe(409);
  });

  it('rechaza aplicar si el grupo del rol está aprobado (bloqueado)', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const he = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/horas-extras`))
        .send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' })
    ).body;
    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `horas extras lock ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const periodoId = periodo.body.periodo.id;
    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    await auth(request(app).post(`/api/periodos/${periodoId}/combinaciones/aprobar`))
      .send({ empresa: 'BOPELUAL S.A.', tipo: 'IESS', clasificacion: 'ADMINISTRATIVO' });

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/horas-extras/${he.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/combinación aprobada/);
  });

  it('DELETE elimina una hora extra pendiente; rechaza si ya fue aplicada', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const pendiente = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/horas-extras`))
        .send({ fecha: '2026-07-13', hora_entrada: '17:30', hora_salida: '19:43' })
    ).body;
    const borrado = await auth(request(app).del(`/api/colaboradores/${col.id}/horas-extras/${pendiente.id}`));
    expect(borrado.status).toBe(200);
  });
});
