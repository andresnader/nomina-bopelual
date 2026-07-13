import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
vi.mock('../src/lib/storage.js', () => ({
  subirArchivo: vi.fn(async (key) => key),
  descargarArchivo: vi.fn(async () => Buffer.from('contenido-fake')),
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearContrato(app, tipoContrato, empresa = 'BOPELUAL S.A.') {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Avanzado ${Date.now()}`, cedula: `AV${Date.now() % 1e8}`
    })
  ).body;
  await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ empresa });
  const contrato = (
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 600, fecha_inicio: '2026-05-01', tipo_contrato: tipoContrato
    })
  ).body;
  return { col, contrato };
}

describe('emisiones avanzadas (comisionista, servicios profesionales)', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('emite un contrato COMISIONISTA, lo descarga, sube y descarga el firmado', async () => {
    const app = createApp();
    const { col, contrato } = await crearContrato(app, 'COMISIONISTA');

    const emitido = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones-avanzadas`)
    ).send({
      tipo_documento: 'COMISIONISTA',
      comision_porcentaje: '10% sobre ventas netas',
      anexo_productos: 'Vehículos usados',
      anexo_precios: 'Según lista vigente',
    });
    expect(emitido.status).toBe(201);
    expect(emitido.body.archivo_generado_key).toMatch(new RegExp(`^contratos/${contrato.id}/`));

    const descarga = await auth(
      request(app).get(
        `/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones-avanzadas/contrato_comisionista_emisiones/${emitido.body.id}/generado`
      )
    );
    expect(descarga.status).toBe(200);

    const subida = await auth(
      request(app).post(
        `/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones-avanzadas/contrato_comisionista_emisiones/${emitido.body.id}/firmado`
      )
    ).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-fake'));
    expect(subida.status).toBe(200);

    // El mismo nombre de tabla que produce el frontend (tablaEmision) debe resolver.
    const tablaFrontend = 'contrato_comisionista_emisiones';
    const firmado = await auth(
      request(app).get(
        `/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones-avanzadas/${tablaFrontend}/${emitido.body.id}/firmado`
      )
    );
    expect(firmado.status).toBe(200);
  });

  it('el contrato emitido aparece embebido en GET /colaboradores/:id (contratos[].emisiones)', async () => {
    const app = createApp();
    const { col, contrato } = await crearContrato(app, 'SERVICIOS_PROFESIONALES');

    const emitido = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones-avanzadas`)
    ).send({
      tipo_documento: 'SERVICIOS_PROFESIONALES',
      honorarios_letras: 'NOVECIENTOS DÓLARES', honorarios_numero: 900, plazo_meses: 12,
    });
    expect(emitido.status).toBe(201);

    const detalle = await auth(request(app).get(`/api/colaboradores/${col.id}`));
    const c = detalle.body.contratos.find((x) => x.id === contrato.id);
    expect(c.emisiones).toHaveLength(1);
    expect(c.emisiones[0].id).toBe(emitido.body.id);
    expect(c.emisiones[0].archivo_firmado_key).toBeFalsy();
  });

  it('rechaza si el tipo_documento no coincide con el tipo_contrato', async () => {
    const app = createApp();
    const { col, contrato } = await crearContrato(app, 'PRODUCTIVO');

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones-avanzadas`)
    ).send({ tipo_documento: 'COMISIONISTA', comision_porcentaje: '10%', anexo_productos: 'x', anexo_precios: 'y' });
    expect(res.status).toBe(400);
  });
});
