import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('DELETE /roles/:rolId/lineas/:lineaId', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  async function crearAnticipoAplicado(app, { fechaInicio, fechaFin, quincena }) {
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Linea ${Date.now()}`, cedula: `LN${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    // Anticipo de una sola cuota (como el caso Jhonas): monto_total=cuota_quincena.
    const anticipo = (await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 150, cuota_quincena: 150, fecha_inicio: fechaInicio, tipo: 'ANTICIPO'
    })).body;
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `linea test ${Date.now()}`, fecha_inicio: fechaInicio, fecha_fin: fechaFin, quincena
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const linea = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas
      .find((l) => l.tipo_linea === 'ANTICIPO_SUELDO');
    return { anticipo, rol, linea };
  }

  it('sin restaurar_saldo, borrar la línea deja el préstamo/anticipo como está (comportamiento actual)', async () => {
    const app = createApp();
    const { anticipo, rol, linea } = await crearAnticipoAplicado(app, {
      fechaInicio: '2026-11-01', fechaFin: '2026-11-15', quincena: 1
    });
    const del = await auth(request(app).del(`/api/roles/${rol.id}/lineas/${linea.id}`));
    expect(del.status).toBe(200);
    const despues = (await auth(request(app).get(`/api/prestamos/${anticipo.id}`))).body;
    expect(Number(despues.saldo_pendiente)).toBe(0);
    expect(despues.activo).toBe(false);
  });

  it('con restaurar_saldo, borrar la línea restaura el saldo y reactiva el préstamo/anticipo', async () => {
    const app = createApp();
    const { anticipo, rol, linea } = await crearAnticipoAplicado(app, {
      fechaInicio: '2026-11-16', fechaFin: '2026-11-30', quincena: 2
    });
    const del = await auth(request(app).del(`/api/roles/${rol.id}/lineas/${linea.id}`)).send({ restaurar_saldo: true });
    expect(del.status).toBe(200);
    const despues = (await auth(request(app).get(`/api/prestamos/${anticipo.id}`))).body;
    expect(Number(despues.saldo_pendiente)).toBe(150);
    expect(despues.activo).toBe(true);

    // Y ahora sí vuelve a aparecer al sincronizar (el bug original: quedaba
    // activo=false para siempre y Sincronizar lo excluía).
    const sync = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync.body.agregadas).toBe(1);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(lineas.some((l) => l.tipo_linea === 'ANTICIPO_SUELDO')).toBe(true);
  });
});
