import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('nómina gobernada por vínculos de empresa', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST /colaboradores crea un vínculo inicial', async () => {
    const app = createApp();
    const s = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Vinc ${s}`, cedula: `V${s % 1e8}`, fecha_ingreso: '2027-02-01'
    })).body;
    const { rows } = await pool.query('SELECT fecha_entrada FROM empleo_periodos WHERE colaborador_id=$1', [col.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].fecha_entrada.toISOString().slice(0, 10)).toBe('2027-02-01');
  });

  it('PATCH fecha_salida cierra el vínculo y prorratea (14/15 días, salida dentro de los últimos 3 días)', async () => {
    const app = createApp();
    const s = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Prorr ${s}`, cedula: `P${s % 1e8}`, fecha_ingreso: '2027-01-01'
    })).body;
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ fecha_salida: '2027-08-14' });
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1500, fecha_inicio: '2027-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `vinc cerca fin ${s}`, fecha_inicio: '2027-08-01', fecha_fin: '2027-08-15', quincena: 1
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    expect(rol).toBeTruthy();
    const { lineas } = (await auth(request(app).get(`/api/roles/${rol.id}`))).body;
    const anticipo = lineas.find((l) => l.tipo_linea === 'ANTICIPO_QUINCENA');
    // factor = 14/15 ≈ 0.93 → 1500 * 40% * 0.93 = 558
    expect(Number(anticipo.monto)).toBe(558);
  });

  it('PATCH fecha_salida fuera de los últimos 3 días excluye del rol (liquidación manual aparte)', async () => {
    const app = createApp();
    const s = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `SaleLejos ${s}`, cedula: `Q${s % 1e8}`, fecha_ingreso: '2027-01-01'
    })).body;
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ fecha_salida: '2027-08-08' });
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1500, fecha_inicio: '2027-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sale lejos ${s}`, fecha_inicio: '2027-08-01', fecha_fin: '2027-08-15', quincena: 1
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    expect(det.body.roles_pago.find((r) => r.colaborador_id === col.id)).toBeUndefined();
  });
});
