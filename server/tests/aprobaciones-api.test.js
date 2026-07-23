import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function periodoConDosGrupos() {
  const s = Date.now();
  const { rows: p } = await pool.query(
    `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena)
     VALUES ('grp ${s}','2026-12-01','2026-12-15',1) RETURNING id`);
  const mk = async (nombre, clasif, ced) => {
    const { rows: c } = await pool.query(
      `INSERT INTO colaboradores (tipo,nombre,cedula,empresa,clasificacion)
       VALUES ('IESS',$1,$2,'BOPELUAL S.A.',$3) RETURNING id`, [nombre, ced, clasif]);
    await pool.query(`INSERT INTO roles_pago (periodo_id,colaborador_id,neto) VALUES ($1,$2,50)`,
      [p[0].id, c[0].id]);
  };
  await mk(`COM ${s}`, 'COMERCIAL', `c${s%1e8}`);
  await mk(`ADM ${s}`, 'ADMINISTRATIVO', `a${s%1e8}`);
  return p[0].id;
}

describe('API aprobación por grupo', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('GET período incluye grupos; aprobar/reabrir cambia el estado', async () => {
    const app = createApp();
    const id = await periodoConDosGrupos();

    let det = await auth(request(app).get(`/api/periodos/${id}`));
    expect(det.body.grupos).toHaveLength(2);
    expect(det.body.grupos.every((g) => g.aprobado === false)).toBe(true);

    const ap = await auth(request(app).post(`/api/periodos/${id}/grupos/aprobar`))
      .send({ empresa: 'BOPELUAL S.A.', grupo: 'COMERCIAL' });
    expect(ap.status).toBe(200);

    det = await auth(request(app).get(`/api/periodos/${id}`));
    expect(det.body.grupos.find((g) => g.grupo === 'COMERCIAL').aprobado).toBe(true);
    expect(det.body.grupos.find((g) => g.grupo === 'ADM').aprobado).toBe(false);

    const re = await auth(request(app).post(`/api/periodos/${id}/grupos/reabrir`))
      .send({ empresa: 'BOPELUAL S.A.', grupo: 'COMERCIAL' });
    expect(re.status).toBe(200);
    det = await auth(request(app).get(`/api/periodos/${id}`));
    expect(det.body.grupos.find((g) => g.grupo === 'COMERCIAL').aprobado).toBe(false);
  });

  it('grupo inválido -> 400', async () => {
    const app = createApp();
    const id = await periodoConDosGrupos();
    const bad = await auth(request(app).post(`/api/periodos/${id}/grupos/aprobar`))
      .send({ empresa: 'BOPELUAL S.A.', grupo: 'XXX' });
    expect(bad.status).toBe(400);
  });
});
