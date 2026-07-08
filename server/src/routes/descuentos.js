import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { obtenerTipos, esTipoDescuentoValido } from '../lib/tipos-descuento.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

router.get('/tipos', async (_req, res) => res.json(await obtenerTipos()));

// Lista global (con nombre del colaborador) o filtrada por colaborador.
router.get('/', async (req, res) => {
  const { colaborador_id, activo } = req.query;
  const cond = [];
  const params = [];
  if (colaborador_id) {
    params.push(colaborador_id);
    cond.push(`d.colaborador_id=$${params.length}`);
  }
  if (activo !== undefined) {
    params.push(activo === 'true');
    cond.push(`d.activo=$${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT d.*, c.nombre AS colaborador_nombre, c.empresa
     FROM descuentos_recurrentes d JOIN colaboradores c ON c.id=d.colaborador_id
     ${where} ORDER BY c.nombre, d.tipo_linea`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { colaborador_id, tipo_linea, monto, aplicar_en = 0, cuotas_restantes, notas } = req.body;
  if (!colaborador_id || !tipo_linea || !monto) {
    return res.status(400).json({ error: 'colaborador_id, tipo_linea y monto requeridos' });
  }
  if (!(await esTipoDescuentoValido(tipo_linea))) {
    return res.status(400).json({ error: `tipo_linea desconocido: ${tipo_linea}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, cuotas_restantes, notas)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [colaborador_id, tipo_linea, monto, aplicar_en, cuotas_restantes ?? null, notas ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', async (req, res) => {
  const campos = ['tipo_linea', 'monto', 'aplicar_en', 'cuotas_restantes', 'activo', 'notas'];
  const set = [];
  const params = [];
  for (const c of campos) {
    if (c in req.body) {
      params.push(req.body[c]);
      set.push(`${c}=$${params.length}`);
    }
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE descuentos_recurrentes SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM descuentos_recurrentes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
