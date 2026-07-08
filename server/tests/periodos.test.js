import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import { crearPeriodo, generarRoles, transicionarPeriodo } from '../src/services/periodos.js';

async function semilla(client) {
  const { rows: u } = await client.query(
    `INSERT INTO usuarios (email, rol) VALUES ('rrhh-svc@bopelual.com','RRHH') RETURNING id`
  );
  const { rows: c } = await client.query(
    `INSERT INTO colaboradores (tipo, nombre) VALUES ('IESS','Juan') RETURNING id`
  );
  await client.query(
    `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio) VALUES ($1, 1000, '2026-01-01')`,
    [c[0].id]
  );
  return { usuarioId: u[0].id, colaboradorId: c[0].id };
}

describe('servicio de períodos', () => {
  it('genera rol de 2da quincena con IESS y provisiones', async () => {
    await withRollback(async (client) => {
      const { usuarioId, colaboradorId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: '2da julio', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31',
        quincena: 2, creado_por: usuarioId
      });
      const res = await generarRoles(client, p.id, { sbu: 460 });
      expect(res.creados).toBeGreaterThanOrEqual(1);
      // Asertar sobre el rol del colaborador sembrado (la BD puede tener otros
      // colaboradores committeados por los tests de integración HTTP).
      const { rows } = await client.query(
        `SELECT rp.neto, rp.total_descuentos FROM roles_pago rp
         WHERE rp.periodo_id=$1 AND rp.colaborador_id=$2`,
        [p.id, colaboradorId]
      );
      // ingresos cash: 60% sueldo(600) + décimo3(83.33) + décimo4(38.33) + fondosReserva(83.3) = 804.96
      // descuentos: IESS 94.5; neto = 804.96 - 94.5 = 710.46
      expect(Number(rows[0].total_descuentos)).toBe(94.5);
      expect(Number(rows[0].neto)).toBe(710.46);
    });
  });

  it('1ra quincena solo genera anticipo (sin IESS)', async () => {
    await withRollback(async (client) => {
      const { usuarioId, colaboradorId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: '1ra julio', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-15',
        quincena: 1, creado_por: usuarioId
      });
      await generarRoles(client, p.id, { sbu: 460 });
      const { rows } = await client.query(
        `SELECT tipo_linea FROM lineas_rol l
         JOIN roles_pago rp ON rp.id=l.rol_pago_id
         WHERE rp.periodo_id=$1 AND rp.colaborador_id=$2`,
        [p.id, colaboradorId]
      );
      const tipos = rows.map((r) => r.tipo_linea);
      expect(tipos).toContain('ANTICIPO_QUINCENA');
      expect(tipos).not.toContain('IESS_PERSONAL');
    });
  });

  it('no genera roles sobre un período ya aprobado', async () => {
    await withRollback(async (client) => {
      const { usuarioId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: 'y', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId
      });
      await generarRoles(client, p.id, { sbu: 460 });
      await transicionarPeriodo(client, p.id, 'aprobar', usuarioId);
      await expect(generarRoles(client, p.id, { sbu: 460 })).rejects.toThrow(/BORRADOR|APROBADO/);
    });
  });

  it('aprobar luego cerrar; no permite re-transición desde CERRADO', async () => {
    await withRollback(async (client) => {
      const { usuarioId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: 'x', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-15', quincena: 1, creado_por: usuarioId
      });
      const ap = await transicionarPeriodo(client, p.id, 'aprobar', usuarioId);
      expect(ap.estado).toBe('APROBADO');
      const ce = await transicionarPeriodo(client, p.id, 'cerrar', usuarioId);
      expect(ce.estado).toBe('CERRADO');
      expect(ce.cerrado_en).not.toBeNull();
      await expect(transicionarPeriodo(client, p.id, 'aprobar', usuarioId)).rejects.toThrow();
    });
  });

  it('generarRoles no aplica préstamo si fecha_prestamo > fecha_fin_periodo', async () => {
    await withRollback(async (client) => {
      const { usuarioId, colaboradorId } = await semilla(client);
      await client.query(`INSERT INTO prestamos (colaborador_id, monto_total, saldo_pendiente, cuota_quincena, fecha_inicio) VALUES ($1, 100, 100, 10, '2026-08-01')`, [colaboradorId]);
      const p = await crearPeriodo(client, { nombre: '2da julio', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: usuarioId });
      await generarRoles(client, p.id, { sbu: 460 });
      const { rows } = await client.query(
        `SELECT 1 FROM lineas_rol l JOIN roles_pago rp ON rp.id=l.rol_pago_id WHERE rp.periodo_id=$1 AND rp.colaborador_id=$2 AND l.tipo_linea='CUOTA_PRESTAMO'`, 
        [p.id, colaboradorId]
      );
      expect(rows.length).toBe(0);
    });
  });
});
