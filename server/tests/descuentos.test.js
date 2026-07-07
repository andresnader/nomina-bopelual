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
});
