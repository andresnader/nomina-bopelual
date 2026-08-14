import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaborador(app, pctAnticipo) {
  const col = (await auth(request(app).post('/api/colaboradores')).send({
    tipo: 'IESS', nombre: `Pct test ${pctAnticipo ?? 'global'} ${Date.now()}`, cedula: `P${Date.now() % 1e8}${pctAnticipo ?? 9}`
  })).body;
  if (pctAnticipo != null) {
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ pct_anticipo: pctAnticipo });
  }
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: 1000, fecha_inicio: '2026-01-01'
  });
  return col;
}

describe('pct_anticipo por colaborador', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('la 1ra quincena usa el % del colaborador y el global como default', async () => {
    const app = createApp();
    const conOverride = await crearColaborador(app, 0.5);
    const sinOverride = await crearColaborador(app, null);

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `pct test ${Date.now()}`, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-15', quincena: 1
    });
    expect(per.status).toBe(201);
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));

    const anticipoDe = async (colId) => {
      const rol = det.body.roles_pago.find((r) => r.colaborador_id === colId);
      const { lineas } = (await auth(request(app).get(`/api/roles/${rol.id}`))).body;
      return Number(lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA').monto);
    };

    expect(await anticipoDe(conOverride.id)).toBe(500); // 50% de 1000
    expect(await anticipoDe(sinOverride.id)).toBe(400); // global 40%
  });

  // Antes había que sincronizar el rol a mano para que un pct_anticipo nuevo
  // llegara a una quincena ya generada. Ahora el propio PATCH del colaborador
  // reconcilia sus períodos en BORRADOR, y el sync posterior no encuentra nada
  // que corregir (queda idempotente).
  it('el PATCH del colaborador recalcula el anticipo de un rol ya generado', async () => {
    const app = createApp();
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `pct tardio ${Date.now()}`, fecha_inicio: '2027-06-01', fecha_fin: '2027-06-15', quincena: 1
    });
    const periodoId = per.body.periodo.id;

    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `PctTardio ${Date.now()}`, cedula: `PT${Date.now() % 1e8}`
    })).body;
    // Contrato primero (dispara la alta automática al período BORRADOR con el 40% global).
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2027-06-01'
    });
    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const anticipoAntes = await auth(request(app).get(`/api/roles/${rol.id}`));
    expect(Number(anticipoAntes.body.lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA').monto)).toBe(400);

    // Ahora, después, RRHH configura el 50% individual.
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ pct_anticipo: 0.5 });

    // Sin pasar por "sincronizar": el rol ya quedó al día.
    const anticipoDespues = await auth(request(app).get(`/api/roles/${rol.id}`));
    expect(Number(anticipoDespues.body.lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA').monto)).toBe(500);

    // Y sincronizar después no lo vuelve a tocar.
    const sync = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync.status).toBe(200);
    expect(sync.body.actualizadas).toBe(0);
  });
});
