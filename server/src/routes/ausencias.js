import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';
import { saldoVacaciones, diasEntre } from '../lib/vacaciones.js';

const router = Router();
router.use(requireAuth);

const GESTORES = ['ADMIN', 'RRHH', 'GERENCIA'];

// Lista: gestores ven todo (filtrable); el colaborador solo lo suyo.
router.get('/', async (req, res) => {
  const esGestor = GESTORES.includes(req.usuario.rol);
  const { estado, colaborador_id } = req.query;
  const cond = [];
  const params = [];

  if (!esGestor) {
    if (!req.usuario.colaborador_id) return res.json([]);
    params.push(req.usuario.colaborador_id);
    cond.push(`a.colaborador_id=$${params.length}`);
  } else if (colaborador_id) {
    params.push(colaborador_id);
    cond.push(`a.colaborador_id=$${params.length}`);
  }
  if (estado) {
    params.push(estado);
    cond.push(`a.estado=$${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT a.*, c.nombre AS colaborador_nombre, u.email AS aprobado_por_email
     FROM ausencias a JOIN colaboradores c ON c.id=a.colaborador_id
     LEFT JOIN usuarios u ON u.id=a.aprobado_por
     ${where} ORDER BY a.creado_en DESC`,
    params
  );
  res.json(rows);
});

// Solicitud: RRHH/ADMIN para cualquiera; el colaborador solo para sí mismo.
router.post('/', async (req, res) => {
  const { colaborador_id, tipo, fecha_desde, fecha_hasta, motivo } = req.body;
  if (!tipo || !fecha_desde || !fecha_hasta) {
    return res.status(400).json({ error: 'tipo, fecha_desde y fecha_hasta requeridos' });
  }
  const esGestor = ['ADMIN', 'RRHH'].includes(req.usuario.rol);
  const objetivo = esGestor ? (colaborador_id ?? req.usuario.colaborador_id) : req.usuario.colaborador_id;
  if (!objetivo) return res.status(400).json({ error: 'colaborador no especificado o usuario sin vincular' });
  if (!esGestor && colaborador_id && colaborador_id !== req.usuario.colaborador_id) {
    return res.status(403).json({ error: 'solo puedes solicitar para ti' });
  }

  const dias = req.body.dias ?? diasEntre(fecha_desde, fecha_hasta);
  if (!(dias > 0)) return res.status(400).json({ error: 'rango de fechas inválido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ausencias (colaborador_id, tipo, fecha_desde, fecha_hasta, dias, motivo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [objetivo, tipo, fecha_desde, fecha_hasta, dias, motivo ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function decisionHandler(estado) {
  return async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE ausencias SET estado=$1, aprobado_por=$2
       WHERE id=$3 AND estado='SOLICITADA' RETURNING *`,
      [estado, req.usuario.id, req.params.id]
    );
    if (rows.length === 0) return res.status(409).json({ error: 'no existe o ya fue decidida' });
    res.json(rows[0]);
  };
}
router.post('/:id/aprobar', requireRole(['ADMIN', 'RRHH']), decisionHandler('APROBADA'));
router.post('/:id/rechazar', requireRole(['ADMIN', 'RRHH']), decisionHandler('RECHAZADA'));

router.delete('/:id', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  await pool.query('DELETE FROM ausencias WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Saldo de vacaciones: derecho legal acumulado − días de vacaciones aprobadas.
router.get(
  '/saldo/:colaboradorId',
  requireSelfOrRole(GESTORES, (req) => req.params.colaboradorId),
  async (req, res) => {
    const [{ rows: col }, { rows: tomados }, { rows: param }] = await Promise.all([
      pool.query('SELECT fecha_ingreso FROM colaboradores WHERE id=$1', [req.params.colaboradorId]),
      pool.query(
        `SELECT COALESCE(SUM(dias),0) AS dias FROM ausencias
         WHERE colaborador_id=$1 AND tipo='VACACIONES' AND estado='APROBADA'`,
        [req.params.colaboradorId]
      ),
      pool.query(`SELECT valor FROM parametros WHERE clave='DIAS_VACACIONES_ANIO'`),
    ]);
    if (col.length === 0) return res.status(404).json({ error: 'no encontrado' });
    res.json(
      saldoVacaciones({
        fechaIngreso: col[0].fecha_ingreso,
        diasTomados: Number(tomados[0].dias),
        diasPorAnio: Number(param[0]?.valor ?? 15),
      })
    );
  }
);

export default router;
