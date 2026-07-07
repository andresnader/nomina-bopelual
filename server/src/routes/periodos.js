import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { crearPeriodo, generarRoles, transicionarPeriodo } from '../services/periodos.js';

const router = Router();
router.use(requireAuth);

async function getParam(client, clave, fallback) {
  const { rows } = await client.query('SELECT valor FROM parametros WHERE clave=$1', [clave]);
  return rows[0]?.valor ?? fallback;
}

router.get('/', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE(SUM(rp.neto),0) AS total_neto
     FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
     GROUP BY p.id ORDER BY p.fecha_inicio DESC`
  );
  res.json(rows);
});

router.post('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { nombre, fecha_inicio, fecha_fin, quincena } = req.body;
  if (!nombre || !fecha_inicio || !fecha_fin || !quincena) {
    return res.status(400).json({ error: 'campos requeridos faltantes' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const periodo = await crearPeriodo(client, {
      nombre, fecha_inicio, fecha_fin, quincena, creado_por: req.usuario.id
    });
    const sbu = Number(await getParam(client, 'SBU', '460'));
    const pctAnticipo = Number(await getParam(client, 'PORCENTAJE_ANTICIPO', '0.40'));
    const { creados } = await generarRoles(client, periodo.id, { sbu, pctAnticipo });
    await client.query('COMMIT');
    res.status(201).json({ periodo, creados });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get('/:id', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (req, res) => {
  const { rows: p } = await pool.query('SELECT * FROM periodos WHERE id=$1', [req.params.id]);
  if (p.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const { rows: roles } = await pool.query(
    `SELECT rp.*, c.nombre AS colaborador_nombre, c.tipo AS colaborador_tipo
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 ORDER BY c.nombre`,
    [req.params.id]
  );
  res.json({ ...p[0], roles_pago: roles });
});

function accionHandler(accion) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const periodo = await transicionarPeriodo(client, req.params.id, accion, req.usuario.id);
      await client.query('COMMIT');
      res.json(periodo);
    } catch (e) {
      await client.query('ROLLBACK');
      const code = e.message.startsWith('Transición inválida') ? 409 : 500;
      res.status(code).json({ error: e.message });
    } finally {
      client.release();
    }
  };
}
router.post('/:id/aprobar', requireRole(['RRHH']), accionHandler('aprobar'));
router.post('/:id/cerrar', requireRole(['RRHH']), accionHandler('cerrar'));

export default router;
