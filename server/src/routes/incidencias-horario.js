import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { calcularIncidencia } from '../lib/incidencias-horario.js';
import { puedeEditarLineas } from '../lib/periodo-fsm.js';
import { recalcularTotales } from '../services/roles.js';
import { grupoDeColaborador } from '../lib/grupos.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'RRHH']));

router.post('/', async (req, res) => {
  const { colaboradorId } = req.params;
  const { fecha, hora_entrada_real, hora_salida_real, notas } = req.body;
  if (!fecha || (!hora_entrada_real && !hora_salida_real)) {
    return res.status(400).json({ error: 'fecha y al menos una hora real son requeridos' });
  }

  const { rows: colRows } = await pool.query('SELECT horario FROM colaboradores WHERE id=$1', [colaboradorId]);
  if (colRows.length === 0) return res.status(404).json({ error: 'colaborador no encontrado' });
  if (!colRows[0].horario) return res.status(400).json({ error: 'el colaborador no tiene horario asignado' });

  const { rows: horarioRows } = await pool.query('SELECT * FROM horarios WHERE codigo=$1', [colRows[0].horario]);
  const horario = horarioRows[0];

  const { rows: contratoRows } = await pool.query(
    `SELECT sueldo_base FROM contratos WHERE colaborador_id=$1 AND fecha_inicio <= $2
     AND (fecha_fin IS NULL OR fecha_fin >= $2) ORDER BY fecha_inicio DESC LIMIT 1`,
    [colaboradorId, fecha]
  );
  if (contratoRows.length === 0) {
    return res.status(400).json({ error: 'el colaborador no tiene un contrato vigente en esa fecha' });
  }

  const { rows: gracRows } = await pool.query(`SELECT valor FROM parametros WHERE clave='MINUTOS_GRACIA'`);
  const minutosGracia = Number(gracRows[0]?.valor ?? 5);

  const { minutosTardanza, minutosSalidaAnticipada, montoTotal } = calcularIncidencia({
    horario, sueldoBase: contratoRows[0].sueldo_base, fecha,
    horaEntradaReal: hora_entrada_real, horaSalidaReal: hora_salida_real, minutosGracia,
  });

  const { rows } = await pool.query(
    `INSERT INTO incidencias_horario
       (colaborador_id, fecha, hora_entrada_real, hora_salida_real, minutos_tardanza,
        minutos_salida_anticipada, monto_total, notas, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [colaboradorId, fecha, hora_entrada_real ?? null, hora_salida_real ?? null,
     minutosTardanza, minutosSalidaAnticipada, montoTotal, notas ?? null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM incidencias_horario WHERE colaborador_id=$1 ORDER BY fecha DESC',
    [req.params.colaboradorId]
  );
  res.json(rows);
});

router.post('/:id/aplicar', async (req, res) => {
  const { colaboradorId, id } = req.params;
  const { rol_pago_id } = req.body;
  if (!rol_pago_id) return res.status(400).json({ error: 'rol_pago_id requerido' });

  const { rows } = await pool.query(
    'SELECT * FROM incidencias_horario WHERE id=$1 AND colaborador_id=$2',
    [id, colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'incidencia no encontrada' });
  if (rows[0].lineas_rol_id) return res.status(409).json({ error: 'la incidencia ya fue aplicada' });

  const { rows: rolRows } = await pool.query(
    `SELECT rp.id, rp.colaborador_id, rp.periodo_id, p.estado, c.empresa, c.tipo, c.clasificacion
     FROM roles_pago rp
     JOIN periodos p ON p.id = rp.periodo_id
     JOIN colaboradores c ON c.id = rp.colaborador_id
     WHERE rp.id=$1`,
    [rol_pago_id]
  );
  if (rolRows.length === 0 || rolRows[0].colaborador_id !== colaboradorId) {
    return res.status(400).json({ error: 'rol de pago inválido para este colaborador' });
  }
  if (!puedeEditarLineas(rolRows[0].estado)) {
    return res.status(409).json({ error: `período ${rolRows[0].estado}: no editable` });
  }
  // El grupo del colaborador no debe estar aprobado (bloqueado) en el período.
  const grupo = grupoDeColaborador(rolRows[0].tipo, rolRows[0].clasificacion);
  const { rows: agRows } = await pool.query(
    `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND grupo=$3`,
    [rolRows[0].periodo_id, rolRows[0].empresa, grupo]
  );
  if (agRows.length > 0) {
    return res.status(409).json({ error: 'grupo aprobado: no editable' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: linea } = await client.query(
      `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, incidencia_horario_id)
       VALUES ($1,'DESCUENTO_HORARIO','DESCUENTO',$2,$3,$4) RETURNING id`,
      [rol_pago_id, rows[0].monto_total, `Incidencia de horario del ${rows[0].fecha.toISOString().slice(0, 10)}`, id]
    );
    await client.query('UPDATE incidencias_horario SET lineas_rol_id=$1 WHERE id=$2', [linea[0].id, id]);
    await recalcularTotales(client, rol_pago_id);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }

  const { rows: actualizado } = await pool.query('SELECT * FROM incidencias_horario WHERE id=$1', [id]);
  res.json(actualizado[0]);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT lineas_rol_id FROM incidencias_horario WHERE id=$1 AND colaborador_id=$2',
    [req.params.id, req.params.colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrada' });
  if (rows[0].lineas_rol_id) return res.status(409).json({ error: 'no se puede eliminar: ya fue aplicada' });
  await pool.query('DELETE FROM incidencias_horario WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
