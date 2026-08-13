import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaborador(app, extra = {}) {
  const res = await auth(request(app).post('/api/colaboradores')).send({
    tipo: 'IESS',
    nombre: `Descuentos test ${Date.now()}`,
    cedula: `D${Date.now() % 1e9}`,
    // Vínculo en el pasado por defecto: sin fecha_ingreso arranca hoy y el
    // colaborador no entra a los períodos con fecha fija de estos tests.
    fecha_ingreso: '2020-01-01',
    ...extra,
  });
  await auth(request(app).post(`/api/colaboradores/${res.body.id}/contratos`)).send({
    sueldo_base: 1000,
    fecha_inicio: '2026-01-01',
  });
  return res.body;
}

describe('descuentos recurrentes', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('rechaza tipos fuera del catálogo', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const res = await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'INVENTADO', monto: 10
    });
    expect(res.status).toBe(400);
  });

  it('se aplican al generar el período según la quincena y decrementan cuotas', async () => {
    const app = createApp();
    const col = await crearColaborador(app);

    // Ambas quincenas, indefinido
    await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 25, aplicar_en: 0
    });
    // Solo 2da quincena, 1 cuota restante
    const conCuotas = (await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'SALUDSA', monto: 45.38, aplicar_en: 2, cuotas_restantes: 1
    })).body;
    // Solo 1ra quincena: NO debe aparecer en la 2da
    await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'COMISARIATO', monto: 21, aplicar_en: 1
    });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `desc test ${Date.now()}`,
      fecha_inicio: '2026-10-16', fecha_fin: '2026-10-31', quincena: 2
    });
    expect(per.status).toBe(201);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    const tipos = lineas.filter((l) => l.clase === 'DESCUENTO').map((l) => l.tipo_linea);

    expect(tipos).toContain('ALIMENTACION');
    expect(tipos).toContain('SALUDSA');
    expect(tipos).not.toContain('COMISARIATO');

    // La cuota única se consumió y el descuento quedó inactivo
    const { rows } = await pool.query('SELECT * FROM descuentos_recurrentes WHERE id=$1', [conCuotas.id]);
    expect(rows[0].cuotas_restantes).toBe(0);
    expect(rows[0].activo).toBe(false);
  });

  it('un descuento vencido antes de que empiece el período no se aplica y queda desactivado', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const desc = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
      })
    ).body;
    await pool.query('UPDATE descuentos_recurrentes SET fecha_vencimiento=$1 WHERE id=$2', ['2021-08-01', desc.id]);

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `vencido test ${Date.now()}`,
      fecha_inicio: '2021-09-16', fecha_fin: '2021-09-30', quincena: 2
    });
    expect(per.status).toBe(201);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(lineas.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(false);

    const { rows } = await pool.query('SELECT activo FROM descuentos_recurrentes WHERE id=$1', [desc.id]);
    expect(rows[0].activo).toBe(false);
  });

  it('un descuento que vence el mismo día que empieza el período todavía se aplica', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const desc = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
      })
    ).body;
    await pool.query('UPDATE descuentos_recurrentes SET fecha_vencimiento=$1 WHERE id=$2', ['2026-10-16', desc.id]);

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `vence hoy test ${Date.now()}`,
      fecha_inicio: '2026-10-16', fecha_fin: '2026-10-31', quincena: 2
    });
    expect(per.status).toBe(201);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(lineas.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(true);

    const { rows } = await pool.query('SELECT activo FROM descuentos_recurrentes WHERE id=$1', [desc.id]);
    expect(rows[0].activo).toBe(true);
  });

  it('POST y PATCH aceptan fecha_vencimiento', async () => {
    const app = createApp();
    const col = await crearColaborador(app);

    const creado = await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 12, fecha_vencimiento: '2026-12-31'
    });
    expect(creado.status).toBe(201);
    expect(creado.body.fecha_vencimiento.slice(0, 10)).toBe('2026-12-31');

    const editado = await auth(request(app).patch(`/api/descuentos/${creado.body.id}`)).send({
      fecha_vencimiento: '2027-01-15'
    });
    expect(editado.status).toBe(200);
    expect(editado.body.fecha_vencimiento.slice(0, 10)).toBe('2027-01-15');
  });

  it('PATCH con una fecha inválida responde 400 (no se cuelga)', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const creado = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 12
      })
    ).body;

    const res = await auth(request(app).patch(`/api/descuentos/${creado.id}`)).send({
      fecha_vencimiento: 'no-es-una-fecha'
    });
    expect(res.status).toBe(400);
  });
});
