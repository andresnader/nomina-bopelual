import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';

import { recalcularTotales } from '../services/roles.js';
import { aplicarPrestamosPendientes, aplicarDescuentosPendientes, aplicarSueldoPendiente, buscarQuincena1 } from '../services/periodos.js';

const router = Router();
router.use(requireAuth);

async function colaboradorDelRol(req) {
  const { rows } = await pool.query('SELECT colaborador_id FROM roles_pago WHERE id=$1', [req.params.id]);
  return rows[0]?.colaborador_id;
}

router.get(
  '/:id',
  requireSelfOrRole(['ADMIN', 'RRHH', 'GERENCIA'], colaboradorDelRol),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT rp.*, c.nombre AS colaborador_nombre, c.cedula, c.cargo,
              p.nombre AS periodo_nombre, p.estado AS periodo_estado,
              p.quincena AS periodo_quincena, p.fecha_inicio AS periodo_fecha_inicio,
              p.mes_periodo_id AS periodo_mes_id
       FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
       JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const rol = rows[0];
    const { rows: lineas } = await pool.query(
      'SELECT * FROM lineas_rol WHERE rol_pago_id=$1 ORDER BY clase, creado_en',
      [req.params.id]
    );

    // Referencia de solo lectura para quien está viendo/editando la 2da
    // quincena: qué se pagó y descontó en la 1ra, sin tener que ir a buscarla
    // manualmente (motivo del bug de sincronización del anticipo de Jhonas).
    let quincenaAnterior;
    if (rol.periodo_quincena === '2') {
      const periodoQ1 = await buscarQuincena1(
        pool,
        { mes_periodo_id: rol.periodo_mes_id, fecha_inicio: rol.periodo_fecha_inicio },
        rol.colaborador_id
      );
      if (periodoQ1) {
        const { rows: rolQ1Rows } = await pool.query(
          'SELECT id, neto FROM roles_pago WHERE periodo_id=$1 AND colaborador_id=$2',
          [periodoQ1.id, rol.colaborador_id]
        );
        if (rolQ1Rows.length > 0) {
          const { rows: lineasQ1 } = await pool.query(
            'SELECT * FROM lineas_rol WHERE rol_pago_id=$1 ORDER BY clase, creado_en',
            [rolQ1Rows[0].id]
          );
          quincenaAnterior = {
            periodo_nombre: periodoQ1.nombre,
            periodo_estado: periodoQ1.estado,
            neto: rolQ1Rows[0].neto,
            lineas: lineasQ1,
          };
        }
      }
    }

    res.json({ ...rol, lineas, ...(quincenaAnterior ? { quincenaAnterior } : {}) });
  }
);

// Un rol es editable si su período está en BORRADOR y su grupo (empresa × grupo)
// no ha sido aprobado todavía.
async function puedeEditarRol(rolId) {
  const { rows } = await pool.query(
    `SELECT p.id AS periodo_id, p.estado, c.empresa, c.tipo, c.clasificacion
     FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
     JOIN colaboradores c ON c.id=rp.colaborador_id WHERE rp.id=$1`,
    [rolId]
  );
  if (rows.length === 0) return { ok: false, code: 404, error: 'rol no encontrado' };
  const r = rows[0];
  if (r.estado !== 'BORRADOR') return { ok: false, code: 409, error: `período ${r.estado}: no editable` };
  const { rows: ag } = await pool.query(
    `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND tipo=$3 AND clasificacion=$4`,
    [r.periodo_id, r.empresa, r.tipo, r.clasificacion]
  );
  if (ag.length > 0) return { ok: false, code: 409, error: 'combinación aprobada: no editable' };
  return { ok: true };
}

router.post('/:id/lineas', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const guard = await puedeEditarRol(req.params.id);
  if (!guard.ok) return res.status(guard.code).json({ error: guard.error });
  const { tipo_linea, clase, monto, descripcion, es_provision } = req.body;
  if (!tipo_linea || !clase || monto == null) return res.status(400).json({ error: 'campos requeridos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, tipo_linea, clase, monto, descripcion ?? null, es_provision ?? false]
    );
    const totales = await recalcularTotales(client, req.params.id);
    await client.query('COMMIT');
    res.status(201).json(totales);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete('/:rolId/lineas/:lineaId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const guard = await puedeEditarRol(req.params.rolId);
  if (!guard.ok) return res.status(guard.code).json({ error: guard.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT descuento_recurrente_id, prestamo_id, monto FROM lineas_rol WHERE id=$1 AND rol_pago_id=$2',
      [req.params.lineaId, req.params.rolId]
    );
    if (rows.length > 0) {
      const { descuento_recurrente_id, prestamo_id, monto } = rows[0];
      if (descuento_recurrente_id) {
        await client.query('UPDATE descuentos_recurrentes SET activo=false WHERE id=$1', [descuento_recurrente_id]);
      }
      // Restaurar el saldo es opcional (lo confirma quien borra la línea):
      // esta cuota ya fue descontada, así que devolverla al préstamo/anticipo
      // solo tiene sentido si de verdad se quiere "deshacer" ese descuento.
      if (prestamo_id && req.body?.restaurar_saldo) {
        await client.query(
          'UPDATE prestamos SET saldo_pendiente=saldo_pendiente+$1, activo=true WHERE id=$2',
          [monto, prestamo_id]
        );
      }
    }
    await client.query('DELETE FROM lineas_rol WHERE id=$1 AND rol_pago_id=$2', [
      req.params.lineaId,
      req.params.rolId
    ]);
    const totales = await recalcularTotales(client, req.params.rolId);
    await client.query('COMMIT');
    res.json(totales);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
// Aplica al rol los préstamos/descuentos recurrentes creados DESPUÉS de
// haber generado el período, sin duplicar los que ya tenga. Solo mientras
// el período esté en BORRADOR (mismo criterio que editar líneas a mano).
router.post('/:id/sincronizar', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const guard = await puedeEditarRol(req.params.id);
  if (!guard.ok) return res.status(guard.code).json({ error: guard.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT rp.colaborador_id, p.estado, p.fecha_inicio, p.fecha_fin, p.quincena
       FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1 FOR UPDATE`,
      [req.params.id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'rol no encontrado' });
    }
    const sueldo = await aplicarSueldoPendiente(client, req.params.id, rows[0].colaborador_id, rows[0].quincena, rows[0].fecha_inicio, rows[0].fecha_fin);
    const { agregadas: agregadosPrestamos, actualizadas: actualizadosPrestamos } = await aplicarPrestamosPendientes(client, req.params.id, rows[0].colaborador_id, rows[0].quincena, rows[0].fecha_fin);
    const { agregadas: agregadosDescuentos, actualizadas: actualizadosDescuentos } = await aplicarDescuentosPendientes(client, req.params.id, rows[0].colaborador_id, rows[0].quincena, rows[0].fecha_inicio);
    const totales = await recalcularTotales(client, req.params.id);
    await client.query('COMMIT');
    res.json({
      ...totales,
      agregadas: sueldo.agregadas + agregadosPrestamos + agregadosDescuentos,
      actualizadas: sueldo.actualizadas + actualizadosPrestamos + actualizadosDescuentos
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
