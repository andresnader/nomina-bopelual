import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const { reconciliarColaboradorEnPeriodosBorrador } = await import('../src/services/periodos.js');
const { crearVinculo, editarVinculo, listarVinculos, sincronizarFechasDerivadas } = await import('../src/services/empleo.js');
const auth = (r) => r.set('Authorization', 'Bearer x');

// Crea colaborador con contrato y un único vínculo abierto con la entrada deseada.
async function colConVinculo(app, entrada) {
  const s = Date.now() + Math.floor(Math.random() * 1e6);
  const col = (await auth(request(app).post('/api/colaboradores')).send({
    tipo: 'IESS', nombre: `Recon ${s}`, cedula: `R${s % 1e8}`
  })).body;
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM empleo_periodos WHERE colaborador_id=$1', [col.id]);
    await crearVinculo(client, col.id, { fecha_entrada: entrada, fecha_salida: null });
    await sincronizarFechasDerivadas(client, col.id);
  } finally { client.release(); }
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: 1500, fecha_inicio: entrada
  });
  return col;
}

describe('reconciliación por salida', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('cerrar el vínculo antes del período borra el rol; reabrir lo re-crea', async () => {
    const app = createApp();
    const col = await colConVinculo(app, '2027-01-01');
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `recon ${Date.now()}`, fecha_inicio: '2027-09-01', fecha_fin: '2027-09-15', quincena: 1
    });
    const periodoId = per.body.periodo.id;
    let det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    expect(det.body.roles_pago.some((r) => r.colaborador_id === col.id)).toBe(true);

    // salida anterior al período -> reconciliar quita el rol
    const client = await pool.connect();
    try {
      const v = (await listarVinculos(client, col.id))[0];
      await editarVinculo(client, v.id, { fecha_entrada: '2027-01-01', fecha_salida: '2027-08-31' });
      await sincronizarFechasDerivadas(client, col.id);
      await reconciliarColaboradorEnPeriodosBorrador(client, col.id);
    } finally { client.release(); }
    det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    expect(det.body.roles_pago.some((r) => r.colaborador_id === col.id)).toBe(false);

    // reabrir el vínculo -> reconciliar re-crea el rol
    const client2 = await pool.connect();
    try {
      const v = (await listarVinculos(client2, col.id))[0];
      await editarVinculo(client2, v.id, { fecha_entrada: '2027-01-01', fecha_salida: null });
      await sincronizarFechasDerivadas(client2, col.id);
      await reconciliarColaboradorEnPeriodosBorrador(client2, col.id);
    } finally { client2.release(); }
    det = await auth(request(app).get(`/api/periodos/${periodoId}`));
    expect(det.body.roles_pago.some((r) => r.colaborador_id === col.id)).toBe(true);
  });
});
