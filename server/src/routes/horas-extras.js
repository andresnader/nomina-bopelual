import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { calcularHorasExtras } from '../lib/horas-extras.js';
import { puedeEditarLineas } from '../lib/periodo-fsm.js';
import { recalcularTotales } from '../services/roles.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'RRHH']));

router.post('/', async (req, res) => {
  const { colaboradorId } = req.params;
  const { fecha, hora_entrada, hora_salida, notas } = req.body;
  if (!fecha || !hora_entrada || !hora_salida) {
    return res.status(400).json({ error: 'fecha, hora_entrada y hora_salida son requeridos' });
  }

  const { rows: contratoRows } = await pool.query(
    `SELECT sueldo_base FROM contratos WHERE colaborador_id=$1 AND fecha_inicio <= $2
     AND (fecha_fin IS NULL OR fecha_fin >= $2) ORDER BY fecha_inicio DESC LIMIT 1`,
    [colaboradorId, fecha]
  );
  if (contratoRows.length === 0) {
    return res.status(400).json({ error: 'el colaborador no tiene un contrato vigente en esa fecha' });
  }

  const { rows: paramRows } = await pool.query(`SELECT valor FROM parametros WHERE clave='HORAS_LABORALES_MES'`);
  const horasLaboralesMes = Number(paramRows[0]?.valor ?? 240);

  const { tipoHora, horas, montoTotal } = calcularHorasExtras({
    sueldoBase: contratoRows[0].sueldo_base, horasLaboralesMes, fecha, horaEntrada: hora_entrada, horaSalida: hora_salida,
  });

  const { rows } = await pool.query(
    `INSERT INTO horas_extras
       (colaborador_id, fecha, hora_entrada, hora_salida, tipo_hora, horas, monto_total, notas, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [colaboradorId, fecha, hora_entrada, hora_salida, tipoHora, horas, montoTotal, notas ?? null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM horas_extras WHERE colaborador_id=$1 ORDER BY fecha DESC',
    [req.params.colaboradorId]
  );
  res.json(rows);
});

router.post('/:id/aplicar', async (req, res) => {
  const { colaboradorId, id } = req.params;
  const { rol_pago_id } = req.body;
  if (!rol_pago_id) return res.status(400).json({ error: 'rol_pago_id requerido' });

  const { rows } = await pool.query(
    'SELECT * FROM horas_extras WHERE id=$1 AND colaborador_id=$2',
    [id, colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'hora extra no encontrada' });
  if (rows[0].lineas_rol_id) return res.status(409).json({ error: 'la hora extra ya fue aplicada' });

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
  const { rows: agRows } = await pool.query(
    `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND tipo=$3 AND clasificacion=$4`,
    [rolRows[0].periodo_id, rolRows[0].empresa, rolRows[0].tipo, rolRows[0].clasificacion]
  );
  if (agRows.length > 0) {
    return res.status(409).json({ error: 'combinación aprobada: no editable' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: linea } = await client.query(
      `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, horas_extras_id)
       VALUES ($1,'HORAS_EXTRAS','INGRESO',$2,$3,$4) RETURNING id`,
      [rol_pago_id, rows[0].monto_total,
       `Horas extras (${rows[0].tipo_hora.toLowerCase()}) del ${rows[0].fecha.toISOString().slice(0, 10)}`, id]
    );
    await client.query('UPDATE horas_extras SET lineas_rol_id=$1 WHERE id=$2', [linea[0].id, id]);
    await recalcularTotales(client, rol_pago_id);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }

  const { rows: actualizado } = await pool.query('SELECT * FROM horas_extras WHERE id=$1', [id]);
  res.json(actualizado[0]);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT lineas_rol_id FROM horas_extras WHERE id=$1 AND colaborador_id=$2',
    [req.params.id, req.params.colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrada' });
  if (rows[0].lineas_rol_id) return res.status(409).json({ error: 'no se puede eliminar: ya fue aplicada' });
  await pool.query('DELETE FROM horas_extras WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
