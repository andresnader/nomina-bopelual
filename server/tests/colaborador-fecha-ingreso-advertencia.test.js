import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// Un colaborador creado sin fecha de ingreso recibe la fecha de HOY como
// inicio de su vínculo laboral. Eso lo deja fuera de cualquier quincena ya
// transcurrida (generarRoles exige fecha_entrada <= periodo.fecha_fin), que
// fue justo lo que pasó con dos ingresos cargados con retraso en julio 2026.
// El default se conserva, pero ahora la respuesta lo dice explícitamente.
describe('advertencia al crear colaborador sin fecha de ingreso', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('advierte que se asumió hoy cuando no se envía fecha_ingreso', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Sin Fecha ${Date.now()}`, cedula: `SF${Date.now() % 1e8}`
    });

    expect(res.status).toBe(201);
    const hoy = new Date().toISOString().slice(0, 10);
    expect(res.body.advertencias).toHaveLength(1);
    expect(res.body.advertencias[0]).toContain(hoy);
    // El colaborador se crea igual: la advertencia no bloquea.
    expect(res.body.id).toBeTruthy();
  });

  it('no advierte nada cuando sí se envía fecha_ingreso', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Con Fecha ${Date.now()}`, cedula: `CF${Date.now() % 1e8}`,
      fecha_ingreso: '2027-03-10'
    });

    expect(res.status).toBe(201);
    expect(res.body.advertencias ?? []).toHaveLength(0);
  });
});
