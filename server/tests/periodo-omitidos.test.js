import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import { crearPeriodo, generarRoles, crearMes } from '../src/services/periodos.js';

// generarRoles descarta colaboradores con JOINs internos: quien no tiene
// contrato vigente o vínculo que cubra el período desaparece del resultado sin
// dejar rastro, y la respuesta solo traía un contador. Ahora también devuelve
// a los omitidos con el motivo, para que el wizard pueda mostrarlos.
async function usuario(client) {
  const { rows } = await client.query(
    `INSERT INTO usuarios (email, rol) VALUES ($1,'RRHH') RETURNING id`,
    [`omitidos-${Math.random()}@bopelual.com`]
  );
  return rows[0].id;
}

async function colaborador(client, nombre, { contrato = true, vinculo = true, salida = null } = {}) {
  const { rows } = await client.query(
    `INSERT INTO colaboradores (tipo, nombre) VALUES ('IESS',$1) RETURNING id`, [nombre]
  );
  const id = rows[0].id;
  if (vinculo) {
    await client.query(
      `INSERT INTO empleo_periodos (colaborador_id, fecha_entrada, fecha_salida) VALUES ($1,'2025-01-01',$2)`,
      [id, salida]
    );
  }
  if (contrato) {
    await client.query(
      `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio) VALUES ($1, 1000, '2025-01-01')`, [id]
    );
  }
  return id;
}

const motivoDe = (omitidos, id) => omitidos.find((o) => o.id === id)?.motivo;

describe('colaboradores omitidos al generar un período', () => {
  it('reporta SIN_CONTRATO a un activo sin contrato vigente', async () => {
    await withRollback(async (client) => {
      const usuarioId = await usuario(client);
      const id = await colaborador(client, 'Sin Contrato', { contrato: false });
      const p = await crearPeriodo(client, {
        nombre: 'Q2', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId
      });

      const { omitidos } = await generarRoles(client, p.id, { sbu: 460 });
      expect(motivoDe(omitidos, id)).toBe('SIN_CONTRATO');
    });
  });

  it('reporta SIN_VINCULO a quien tiene contrato pero ningún vínculo que cubra el período', async () => {
    await withRollback(async (client) => {
      const usuarioId = await usuario(client);
      const id = await colaborador(client, 'Sin Vinculo', { vinculo: false });
      const p = await crearPeriodo(client, {
        nombre: 'Q2', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId
      });

      const { omitidos } = await generarRoles(client, p.id, { sbu: 460 });
      expect(motivoDe(omitidos, id)).toBe('SIN_VINCULO');
    });
  });

  it('reporta SALIDA_PREVIA a quien salió antes de la ventana de cierre', async () => {
    await withRollback(async (client) => {
      const usuarioId = await usuario(client);
      // Salida el 20: el vínculo cubre el período, pero cae fuera de los
      // últimos 3 días, así que su liquidación se hace aparte (regla vigente).
      const id = await colaborador(client, 'Salio Antes', { salida: '2026-07-20' });
      const p = await crearPeriodo(client, {
        nombre: 'Q2', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId
      });

      const { omitidos } = await generarRoles(client, p.id, { sbu: 460 });
      expect(motivoDe(omitidos, id)).toBe('SALIDA_PREVIA');
    });
  });

  it('no reporta al colaborador que sí entró al período', async () => {
    await withRollback(async (client) => {
      const usuarioId = await usuario(client);
      const id = await colaborador(client, 'Sano');
      const p = await crearPeriodo(client, {
        nombre: 'Q2', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId
      });

      const { creados, omitidos } = await generarRoles(client, p.id, { sbu: 460 });
      expect(creados).toBeGreaterThanOrEqual(1);
      expect(omitidos.some((o) => o.id === id)).toBe(false);
    });
  });

  it('incluye el nombre para poder mostrarlo sin otra consulta', async () => {
    await withRollback(async (client) => {
      const usuarioId = await usuario(client);
      const id = await colaborador(client, 'Nombre Visible', { contrato: false });
      const p = await crearPeriodo(client, {
        nombre: 'Q2', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId
      });

      const { omitidos } = await generarRoles(client, p.id, { sbu: 460 });
      expect(omitidos.find((o) => o.id === id).nombre).toBe('Nombre Visible');
    });
  });

  it('crearMes reporta al omitido una sola vez aunque falte en las dos quincenas', async () => {
    await withRollback(async (client) => {
      const usuarioId = await usuario(client);
      const id = await colaborador(client, 'Falta En Ambas', { contrato: false });

      const { omitidos } = await crearMes(client, { anio: 2025, mes: 5, creado_por: usuarioId });
      expect(omitidos.filter((o) => o.id === id)).toHaveLength(1);
    });
  });
});
