import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import { eliminarRol } from '../src/services/periodos.js';

describe('eliminarRol', () => {
  it('restaura el saldo del préstamo al borrar el rol', async () => {
    await withRollback(async (client) => {
      const { rows: c } = await client.query(
        `INSERT INTO colaboradores (tipo,nombre) VALUES ('IESS','R') RETURNING id`);
      const { rows: p } = await client.query(
        `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena)
         VALUES ('elim','2026-10-01','2026-10-15',1) RETURNING id`);
      const { rows: pr } = await client.query(
        `INSERT INTO prestamos (colaborador_id, monto_total, saldo_pendiente, cuota_quincena, fecha_inicio, activo, tipo)
         VALUES ($1, 500, 400, 100, '2026-01-01', true, 'PRESTAMO') RETURNING id`, [c[0].id]);
      const { rows: rol } = await client.query(
        `INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,0) RETURNING id`,
        [p[0].id, c[0].id]);
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, prestamo_id)
         VALUES ($1,'CUOTA_PRESTAMO','DESCUENTO',100,$2)`, [rol[0].id, pr[0].id]);
      // simular que al generar el rol se descontó la cuota:
      await client.query('UPDATE prestamos SET saldo_pendiente=300 WHERE id=$1', [pr[0].id]);

      await eliminarRol(client, rol[0].id);

      const { rows: after } = await client.query('SELECT saldo_pendiente, activo FROM prestamos WHERE id=$1', [pr[0].id]);
      expect(Number(after[0].saldo_pendiente)).toBe(400); // 300 + 100 restaurado
      expect(after[0].activo).toBe(true);
      const { rows: rolAfter } = await client.query('SELECT 1 FROM roles_pago WHERE id=$1', [rol[0].id]);
      expect(rolAfter).toHaveLength(0);
    });
  });
});
