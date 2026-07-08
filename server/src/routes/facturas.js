import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { retencionProveedor } from '../lib/calculo.js';
import { round2 } from '../lib/round.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

router.get('/', async (req, res) => {
  const cond = [];
  const params = [];
  if (req.query.estado) {
    params.push(req.query.estado);
    cond.push(`f.estado=$${params.length}`);
  }
  if (req.query.periodo_id) {
    params.push(req.query.periodo_id);
    cond.push(`f.periodo_id=$${params.length}`);
  }
  if (req.query.colaborador_id) {
    params.push(req.query.colaborador_id);
    cond.push(`f.colaborador_id=$${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT f.*, c.nombre AS colaborador_nombre FROM facturas_proveedor f
     JOIN colaboradores c ON c.id=f.colaborador_id ${where} ORDER BY f.fecha_factura DESC`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { colaborador_id, periodo_id, numero_factura, fecha_factura, monto_bruto } = req.body;
  if (!colaborador_id || monto_bruto == null) return res.status(400).json({ error: 'campos requeridos' });

  const { rows: colRows } = await pool.query('SELECT empresa FROM colaboradores WHERE id=$1', [colaborador_id]);
  if (colRows.length === 0) return res.status(400).json({ error: 'colaborador no existe' });
  const empresa = colRows[0].empresa;

  // La retención se calcula SIEMPRE en el servidor. Por defecto se aplica;
  // solo se omite si la empresa del proveedor tiene aplica_retencion=false.
  let aplicaRetencion = true;
  if (empresa) {
    const { rows: cfg } = await pool.query('SELECT aplica_retencion FROM config_empresas WHERE empresa=$1', [empresa]);
    if (cfg.length > 0) aplicaRetencion = cfg[0].aplica_retencion;
  }
  const { retencion, neto } = aplicaRetencion
    ? retencionProveedor(Number(monto_bruto))
    : { retencion: 0, neto: round2(Number(monto_bruto)) };

  const { rows } = await pool.query(
    `INSERT INTO facturas_proveedor
      (colaborador_id, periodo_id, numero_factura, fecha_factura, monto_bruto, retencion_10pct, neto, empresa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [colaborador_id, periodo_id ?? null, numero_factura, fecha_factura, monto_bruto, retencion, neto, empresa]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { estado } = req.body;
  const pagada = estado === 'PAGADA';
  const { rows } = await pool.query(
    `UPDATE facturas_proveedor SET estado=COALESCE($1, estado),
       pagada_en=CASE WHEN $2 THEN now() ELSE pagada_en END WHERE id=$3 RETURNING *`,
    [estado ?? null, pagada, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrada' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM facturas_proveedor WHERE id=$1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'no encontrada' });
  res.json({ ok: true });
});

export default router;
