import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaboradorConContrato(app, { fechaSalida } = {}) {
  const sello = Date.now() % 1e8;
  const col = (await auth(request(app).post('/api/colaboradores')).send({
    tipo: 'IESS', nombre: `Salida test ${sello}`, cedula: `S${sello}`
  })).body;
  const patch = {};
  if (fechaSalida) patch.fecha_salida = fechaSalida;
  if (Object.keys(patch).length) {
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send(patch);
  }
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: 1500, fecha_inicio: '2027-01-01'
  });
  return col;
}

describe('fecha_salida: pago hasta el día trabajado', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('guarda y devuelve fecha_salida en la ficha del colaborador', async () => {
    const app = createApp();
    const col = await crearColaboradorConContrato(app, { fechaSalida: '2027-08-08' });
    const det = await auth(request(app).get(`/api/colaboradores/${col.id}`));
    expect(det.body.fecha_salida.slice(0, 10)).toBe('2027-08-08');
  });

  it('prorratea si la salida cae en los últimos 3 días del período (14 de 15 días)', async () => {
    const app = createApp();
    const col = await crearColaboradorConContrato(app, { fechaSalida: '2027-08-14' });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `salida cerca ${Date.now()}`, fecha_inicio: '2027-08-01', fecha_fin: '2027-08-15', quincena: 1
    });
    expect(per.status).toBe(201);
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    expect(rol).toBeTruthy();

    const { lineas } = (await auth(request(app).get(`/api/roles/${rol.id}`))).body;
    const anticipo = lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA');
    // factor = 14/15 ≈ 0.93 → 1500 * 40% * 0.93 = 558
    expect(Number(anticipo.monto)).toBe(558);
    expect(anticipo.descripcion).toContain('prorrateado');
  });

  it('excluye del período a quien cesa lejos del fin (regla últimos 3 días)', async () => {
    const app = createApp();
    const col = await crearColaboradorConContrato(app, { fechaSalida: '2027-08-08' });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `salida lejos ${Date.now()}`, fecha_inicio: '2027-08-01', fecha_fin: '2027-08-15', quincena: 1
    });
    expect(per.status).toBe(201);
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    // salió el 8, la quincena cierra el 15 → fuera de los últimos 3 días → sin rol
    expect(det.body.roles_pago.find((r) => r.colaborador_id === col.id)).toBeUndefined();
  });

  it('no genera rol si la salida fue antes de que empiece el período', async () => {
    const app = createApp();
    const col = await crearColaboradorConContrato(app, { fechaSalida: '2027-07-30' });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `salida previa ${Date.now()}`, fecha_inicio: '2027-08-01', fecha_fin: '2027-08-15', quincena: 1
    });
    expect(per.status).toBe(201);
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    expect(det.body.roles_pago.find((r) => r.colaborador_id === col.id)).toBeUndefined();
  });
});

describe('TXT dividido por clasificación comercial/administrativo', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('grupo=COMERCIAL solo incluye IESS clasificados como comerciales', async () => {
    const app = createApp();
    const sello = Date.now();
    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT clasif ${sello}','2026-11-01','2026-11-15',1,'APROBADO') RETURNING id`
    );
    const { rows: com } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, clasificacion, cuenta_bancaria, tipo_cuenta, codigo_banco)
       VALUES ('IESS','05${sello % 1e8}','VENDEDOR UNO','COMERCIAL','2205467800','AHORRO','10') RETURNING id`
    );
    const { rows: adm } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, clasificacion, cuenta_bancaria, tipo_cuenta, codigo_banco)
       VALUES ('IESS','04${sello % 1e8}','ADMIN UNO','ADMINISTRATIVO','2205467811','AHORRO','10') RETURNING id`
    );
    await pool.query(
      `INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,100), ($1,$3,200)`,
      [per[0].id, com[0].id, adm[0].id]
    );

    const comercial = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?grupo=COMERCIAL`));
    expect(comercial.body.incluidos).toBe(1);
    expect(comercial.body.contenido).toContain('VENDEDOR UNO');
    expect(comercial.body.contenido).not.toContain('ADMIN UNO');

    const admTxt = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?grupo=ADM`));
    expect(admTxt.body.incluidos).toBe(1);
    expect(admTxt.body.contenido).toContain('ADMIN UNO');

    const todos = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago`));
    expect(todos.body.incluidos).toBe(2);
  });
});
