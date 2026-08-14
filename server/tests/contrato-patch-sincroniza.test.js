import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// Crear un contrato sí reconcilia los períodos en BORRADOR, y editar la ficha
// del colaborador también. Editar el CONTRATO no hacía ninguna de las dos
// cosas: el sueldo corregido quedaba en la ficha pero la quincena ya generada
// seguía con el viejo, que es lo que obligaba a corregir rol por rol a mano.
describe('PATCH de contrato: bono y re-sincronización', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  const contratoVigente = async (app, sello, sueldo = 1000) => {
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Patch ${sello}`, cedula: `PT${sello % 1e8}`,
        fecha_ingreso: '2020-01-01', sueldo_base: sueldo
      })
    ).body;
    const { rows } = await pool.query(
      'SELECT id FROM contratos WHERE colaborador_id=$1 AND fecha_fin IS NULL', [col.id]
    );
    return { col, contratoId: rows[0].id };
  };

  it('guarda el bono, que antes se descartaba en silencio', async () => {
    const app = createApp();
    const { col, contratoId } = await contratoVigente(app, Date.now());

    const res = await auth(
      request(app).patch(`/api/colaboradores/${col.id}/contratos/${contratoId}`)
    ).send({ bono: 250 });

    expect(res.status).toBe(200);
    expect(Number(res.body.bono)).toBe(250);
  });

  it('refresca la quincena en BORRADOR al corregir el sueldo', async () => {
    const app = createApp();
    const sello = Date.now();
    const { col, contratoId } = await contratoVigente(app, sello, 1000);

    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q1 patch ${sello}`, fecha_inicio: '2021-06-01', fecha_fin: '2021-06-15', quincena: 1
      })
    ).body;

    const anticipo = async () => {
      const { rows } = await pool.query(
        `SELECT l.monto FROM lineas_rol l
         JOIN roles_pago rp ON rp.id=l.rol_pago_id
         WHERE rp.periodo_id=$1 AND rp.colaborador_id=$2 AND l.tipo_linea='ANTICIPO_QUINCENA'`,
        [per.periodo.id, col.id]
      );
      return Number(rows[0]?.monto);
    };
    expect(await anticipo()).toBe(400); // 40% de 1000

    await auth(
      request(app).patch(`/api/colaboradores/${col.id}/contratos/${contratoId}`)
    ).send({ sueldo_base: 2000 });

    expect(await anticipo()).toBe(800); // 40% de 2000, sin tocar el rol a mano
  });

  it('deja el neto del rol coherente con el sueldo corregido', async () => {
    const app = createApp();
    const sello = Date.now();
    const { col, contratoId } = await contratoVigente(app, sello, 1000);

    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q1 neto ${sello}`, fecha_inicio: '2021-06-01', fecha_fin: '2021-06-15', quincena: 1
      })
    ).body;

    await auth(
      request(app).patch(`/api/colaboradores/${col.id}/contratos/${contratoId}`)
    ).send({ sueldo_base: 2000 });

    const { rows } = await pool.query(
      'SELECT neto FROM roles_pago WHERE periodo_id=$1 AND colaborador_id=$2',
      [per.periodo.id, col.id]
    );
    expect(Number(rows[0].neto)).toBe(800);
  });
});
