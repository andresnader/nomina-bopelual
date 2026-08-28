import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import XLSX from 'xlsx';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('GET /api/colaboradores/:id/rol-individual-excel', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('devuelve un xlsx en base64 para un colaborador IESS con período válido', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `RolIndividualApi ${Date.now()}`, cedula: `RA${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2028-05-01'
    });
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da api ${Date.now()}`, fecha_inicio: '2028-05-16', fecha_fin: '2028-05-31', quincena: 2
    });

    const res = await auth(request(app).get(`/api/colaboradores/${col.id}/rol-individual-excel?periodo_id=${q2.body.periodo.id}`));
    expect(res.status).toBe(200);
    expect(res.body.archivo).toMatch(/\.xlsx$/);
    const wb = XLSX.read(Buffer.from(res.body.contenidoBase64, 'base64'), { type: 'buffer' });
    expect(wb.SheetNames.length).toBeGreaterThan(0);
  });

  it('rechaza sin periodo_id', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `RolIndividualSinPeriodo ${Date.now()}`, cedula: `SP${Date.now() % 1e8}`
    })).body;
    const res = await auth(request(app).get(`/api/colaboradores/${col.id}/rol-individual-excel`));
    expect(res.status).toBe(400);
  });

  it('rechaza para colaborador EXTERNO', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'EXTERNO', nombre: `RolIndividualExternoApi ${Date.now()}`, cedula: `EA${Date.now() % 1e8}`
    })).body;
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da externo api ${Date.now()}`, fecha_inicio: '2028-06-16', fecha_fin: '2028-06-30', quincena: 2
    });
    const res = await auth(request(app).get(`/api/colaboradores/${col.id}/rol-individual-excel?periodo_id=${q2.body.periodo.id}`));
    expect(res.status).toBe(400);
  });
});
