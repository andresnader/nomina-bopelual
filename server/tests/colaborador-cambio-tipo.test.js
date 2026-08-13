import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// `tipo` se fijaba al crear el colaborador y no había forma de corregirlo: ni
// en la whitelist del PATCH ni en la ficha. Y gobierna todo el cálculo (el
// porcentaje, el prorrateo y las líneas de ley), así que una carga equivocada
// dejaba todos sus números mal sin manera de arreglarlo desde la app.
describe('cambio de tipo IESS/EXTERNO', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  const crearIess = async (app, sello) => (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Tipo ${sello}`, cedula: `TI${sello % 1e8}`,
      fecha_ingreso: '2020-01-01', sueldo_base: 1000
    })
  ).body;

  const lineas = async (periodoId, colId) => {
    const { rows } = await pool.query(
      `SELECT l.tipo_linea, l.monto FROM lineas_rol l
       JOIN roles_pago rp ON rp.id=l.rol_pago_id
       WHERE rp.periodo_id=$1 AND rp.colaborador_id=$2`,
      [periodoId, colId]
    );
    return Object.fromEntries(rows.map((r) => [r.tipo_linea, Number(r.monto)]));
  };

  it('guarda el nuevo tipo', async () => {
    const app = createApp();
    const col = await crearIess(app, Date.now());

    const res = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ tipo: 'EXTERNO' });

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('EXTERNO');
  });

  it('rechaza un tipo desconocido', async () => {
    const app = createApp();
    const col = await crearIess(app, Date.now());

    const res = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ tipo: 'CONTRATISTA' });

    expect(res.status).toBe(400);
    // El mensaje tiene que hablar del tipo: un 400 genérico de "nada que
    // actualizar" también pasaría, y no probaría nada.
    expect(res.body.error).toMatch(/tipo/i);
  });

  it('al pasar a EXTERNO borra las líneas de ley del rol en BORRADOR', async () => {
    const app = createApp();
    const sello = Date.now();
    const col = await crearIess(app, sello);
    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q2 tipo ${sello}`, fecha_inicio: '2021-07-16', fecha_fin: '2021-07-31', quincena: 2
      })
    ).body;

    // De IESS le corresponden aporte personal y los tres beneficios de ley.
    expect(await lineas(per.periodo.id, col.id)).toMatchObject({ IESS_PERSONAL: 94.5 });

    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ tipo: 'EXTERNO' });

    const despues = await lineas(per.periodo.id, col.id);
    expect(despues.IESS_PERSONAL).toBeUndefined();
    expect(despues.DECIMO_TERCERO).toBeUndefined();
    expect(despues.DECIMO_CUARTO).toBeUndefined();
    expect(despues.FONDOS_RESERVA).toBeUndefined();
  });

  it('al pasar a EXTERNO recalcula el porcentaje de la quincena', async () => {
    const app = createApp();
    const sello = Date.now();
    const col = await crearIess(app, sello);
    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q1 tipo ${sello}`, fecha_inicio: '2021-07-01', fecha_fin: '2021-07-15', quincena: 1
      })
    ).body;
    expect((await lineas(per.periodo.id, col.id)).ANTICIPO_QUINCENA).toBe(400); // IESS: 40%

    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ tipo: 'EXTERNO' });

    expect((await lineas(per.periodo.id, col.id)).ANTICIPO_QUINCENA).toBe(500); // EXTERNO: 50%
  });

  it('deja el neto coherente después de cambiar el tipo', async () => {
    const app = createApp();
    const sello = Date.now();
    const col = await crearIess(app, sello);
    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q2 neto tipo ${sello}`, fecha_inicio: '2021-07-16', fecha_fin: '2021-07-31', quincena: 2
      })
    ).body;

    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ tipo: 'EXTERNO' });

    const { rows } = await pool.query(
      'SELECT neto FROM roles_pago WHERE periodo_id=$1 AND colaborador_id=$2', [per.periodo.id, col.id]
    );
    // EXTERNO en 2da quincena: solo el 50% restante del sueldo, sin aportes.
    expect(Number(rows[0].neto)).toBe(500);
  });
});
