import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

// Catálogo para el select de ContratosTab: cualquier usuario autenticado
// (RRHH crea contratos igual que ADMIN).
router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM tipos_contrato WHERE activo=true ORDER BY codigo');
  res.json(rows);
});

// Gestión del catálogo: solo ADMIN (Configuración → Tipos de contrato).
router.get('/todos', requireRole(['ADMIN']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM tipos_contrato ORDER BY codigo');
  res.json(rows);
});

router.post('/', requireRole(['ADMIN']), async (req, res) => {
  const { codigo, nombre } = req.body;
  if (!codigo || !nombre) {
    return res.status(400).json({ error: 'codigo y nombre requeridos' });
  }
  const codigoUpper = String(codigo).trim().toUpperCase().replace(/\s+/g, '_');
  try {
    const { rows } = await pool.query(
      `INSERT INTO tipos_contrato (codigo, nombre) VALUES ($1, $2) RETURNING *`,
      [codigoUpper, String(nombre).trim()]
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(409).json({ error: `el código ${codigoUpper} ya existe` });
  }
});

router.patch('/:codigo', requireRole(['ADMIN']), async (req, res) => {
  const set = [];
  const params = [];
  if ('nombre' in req.body) {
    params.push(String(req.body.nombre).trim());
    set.push(`nombre=$${params.length}`);
  }
  if ('activo' in req.body) {
    params.push(!!req.body.activo);
    set.push(`activo=$${params.length}`);
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.codigo);
  const { rows } = await pool.query(
    `UPDATE tipos_contrato SET ${set.join(', ')} WHERE codigo=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

export default router;
