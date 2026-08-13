import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// El sueldo vive en `contratos`, no en `colaboradores`, y generarRoles lo lee
// con un JOIN interno sobre el contrato vigente: quien no tiene contrato no
// aparece en el período — desaparece entero, sin fila ni aviso. Hasta ahora el
// alta no creaba contrato, así que había que cargarlo aparte desde la ficha y
// era fácil olvidarlo. Ahora el alta acepta el sueldo, y si no viene lo avisa.
describe('sueldo en el alta del colaborador', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('crea el contrato vigente cuando se envía sueldo_base', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Con Sueldo ${Date.now()}`, cedula: `CS${Date.now() % 1e8}`,
      fecha_ingreso: '2026-03-01', sueldo_base: 800
    });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      'SELECT sueldo_base, fecha_inicio, fecha_fin FROM contratos WHERE colaborador_id=$1',
      [res.body.id]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].sueldo_base)).toBe(800);
    expect(rows[0].fecha_fin).toBeNull(); // vigente: es lo que exige generarRoles
  });

  it('arranca el contrato en la fecha de ingreso del colaborador', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Fecha Contrato ${Date.now()}`, cedula: `FC${Date.now() % 1e8}`,
      fecha_ingreso: '2026-03-01', sueldo_base: 800
    });

    const { rows } = await pool.query(
      `SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS inicio FROM contratos WHERE colaborador_id=$1`,
      [res.body.id]
    );
    expect(rows[0].inicio).toBe('2026-03-01');
  });

  it('guarda el bono junto con el sueldo', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Con Bono ${Date.now()}`, cedula: `CB${Date.now() % 1e8}`,
      fecha_ingreso: '2026-03-01', sueldo_base: 800, bono: 120
    });

    const { rows } = await pool.query('SELECT bono FROM contratos WHERE colaborador_id=$1', [res.body.id]);
    expect(Number(rows[0].bono)).toBe(120);
  });

  it('advierte que no entrará en ninguna quincena cuando se crea sin sueldo', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Sin Sueldo ${Date.now()}`, cedula: `SS${Date.now() % 1e8}`,
      fecha_ingreso: '2026-03-01'
    });

    expect(res.status).toBe(201);
    expect(res.body.advertencias.some((a) => /quincena/i.test(a))).toBe(true);
    // La advertencia no bloquea: el colaborador se crea igual, sin contrato.
    expect(res.body.id).toBeTruthy();
    const { rows } = await pool.query('SELECT id FROM contratos WHERE colaborador_id=$1', [res.body.id]);
    expect(rows).toHaveLength(0);
  });

  it('no advierte nada cuando el alta trae fecha de ingreso y sueldo', async () => {
    const app = createApp();
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Alta Completa ${Date.now()}`, cedula: `AC${Date.now() % 1e8}`,
      fecha_ingreso: '2026-03-01', sueldo_base: 800
    });

    expect(res.body.advertencias ?? []).toHaveLength(0);
  });

  it('rechaza un sueldo no numérico sin dejar el colaborador a medio crear', async () => {
    const app = createApp();
    const nombre = `Sueldo Malo ${Date.now()}`;
    const res = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre, cedula: `SM${Date.now() % 1e8}`,
      fecha_ingreso: '2026-03-01', sueldo_base: 'ochocientos'
    });

    expect(res.status).toBe(400);
    // La transacción cubre colaborador + contrato: no queda huérfano.
    const { rows } = await pool.query('SELECT id FROM colaboradores WHERE nombre=$1', [nombre.toUpperCase()]);
    expect(rows).toHaveLength(0);
  });
});
