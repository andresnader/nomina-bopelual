import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('iess_tasa_personal_especial por colaborador', () => {
  it('el PATCH del colaborador recalcula el IESS de un rol de 2da quincena ya generado', async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
    const app = createApp();

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `iess especial ${Date.now()}`, fecha_inicio: '2027-09-16', fecha_fin: '2027-09-30', quincena: 2
    });
    const periodoId = per.body.periodo.id;

    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `IessEspecial ${Date.now()}`, cedula: `IE${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2027-09-01'
    });

    const det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const iessDe = async () => {
      const r = await auth(request(app).get(`/api/roles/${rol.id}`));
      return Number(r.body.lineas.find((l) => l.tipo_linea === 'IESS_PERSONAL').monto);
    };
    expect(await iessDe()).toBe(94.5);

    const patch = await auth(request(app).patch(`/api/colaboradores/${col.id}`))
      .send({ iess_tasa_personal_especial: 0.176 });
    expect(patch.status).toBe(200);

    expect(await iessDe()).toBe(176);
  });
});
