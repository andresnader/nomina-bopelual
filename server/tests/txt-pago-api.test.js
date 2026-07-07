import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('GET /api/periodos/:id/txt-pago', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('genera el TXT con transferencias y reporta excluidos sin datos bancarios', async () => {
    const app = createApp();
    const sello = Date.now();

    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT test ${sello}','2026-09-01','2026-09-15',1,'CERRADO') RETURNING id`
    );
    const { rows: conCuenta } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa, cuenta_bancaria, tipo_cuenta, codigo_banco)
       VALUES ('IESS','09${sello % 1e8}','PAGABLE UNO','ADMINISTRACION','BOPELUAL S.A.','2205467800','AHORRO','10')
       RETURNING id`
    );
    const { rows: sinCuenta } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa)
       VALUES ('EXTERNO','08${sello % 1e8}','SIN CUENTA','COMERCIAL','BOPELUAL S.A.') RETURNING id`
    );
    await pool.query(
      `INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,190.00), ($1,$3,50.00)`,
      [per[0].id, conCuenta[0].id, sinCuenta[0].id]
    );

    const res = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago`));
    expect(res.status).toBe(200);
    expect(res.body.incluidos).toBe(1);
    expect(res.body.total).toBe(190);
    expect(res.body.excluidos).toEqual([
      { nombre: 'SIN CUENTA', neto: '50.00', motivo: 'sin datos bancarios' }
    ]);
    const linea = res.body.contenido.split('\r\n')[0].split('\t');
    expect(linea).toEqual([
      'PA', '1', 'USD', '19000', 'CTA', 'AHO', '2205467800',
      res.body.descripcion, 'C', `09${sello % 1e8}`, 'PAGABLE UNO', '10'
    ]);

    // filtro por grupo: ADM incluye al IESS administrativo, SERV_PROF al externo (excluido)
    const adm = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?grupo=ADM`));
    expect(adm.body.incluidos).toBe(1);
    const sp = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?grupo=SERV_PROF`));
    expect(sp.body.incluidos).toBe(0);
    expect(sp.body.excluidos).toHaveLength(1);
  });

  it('rechaza grupo inválido y período inexistente', async () => {
    const app = createApp();
    const malGrupo = await auth(
      request(app).get('/api/periodos/00000000-0000-0000-0000-000000000000/txt-pago?grupo=NADA')
    );
    expect(malGrupo.status).toBe(400);
    const noExiste = await auth(
      request(app).get('/api/periodos/00000000-0000-0000-0000-000000000000/txt-pago')
    );
    expect(noExiste.status).toBe(404);
  });
});
