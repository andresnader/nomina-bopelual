import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

// Catálogo para selects (ficha del colaborador): cualquier usuario autenticado.
router.get('/', async (req, res) => {
  const cond = req.query.q ? `AND (nombre ILIKE $1 OR codigo LIKE $1)` : '';
  const params = req.query.q ? [`%${req.query.q}%`] : [];
  const { rows } = await pool.query(
    `SELECT * FROM bancos WHERE activo=true ${cond} ORDER BY codigo::int`,
    params
  );
  res.json(rows);
});

// Gestión del catálogo: solo ADMIN (Configuración → Configuración de bancos).
router.get('/todos', requireRole(['ADMIN']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM bancos ORDER BY codigo::int');
  res.json(rows);
});

router.post('/', requireRole(['ADMIN']), async (req, res) => {
  const { codigo, nombre } = req.body;
  if (!codigo || !nombre || !/^\d+$/.test(String(codigo))) {
    return res.status(400).json({ error: 'código numérico y nombre requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO bancos (codigo, nombre) VALUES ($1,$2) RETURNING *`,
      [String(codigo), nombre.trim().toUpperCase()]
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(409).json({ error: `el código ${codigo} ya existe` });
  }
});

router.patch('/:codigo', requireRole(['ADMIN']), async (req, res) => {
  const set = [];
  const params = [];
  if ('nombre' in req.body) {
    params.push(String(req.body.nombre).trim().toUpperCase());
    set.push(`nombre=$${params.length}`);
  }
  if ('activo' in req.body) {
    params.push(!!req.body.activo);
    set.push(`activo=$${params.length}`);
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.codigo);
  const { rows } = await pool.query(
    `UPDATE bancos SET ${set.join(', ')} WHERE codigo=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

export default router;
