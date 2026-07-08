import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { round2 } from '../lib/round.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

const SORT_VALIDO = { nombre: 'c.nombre', fecha_inicio: 'p.fecha_inicio', saldo: 'p.saldo_pendiente', monto: 'p.monto_total' };

// Lista paginada con búsqueda por colaborador y filtro por estado.
// Devuelve además los totales globales del filtro (para los KPIs).
router.get('/', async (req, res) => {
  const { q, activo, sort, order, page, per_page } = req.query;
  const cond = [];
  const params = [];

  if (activo !== undefined) {
    params.push(activo === 'true');
    cond.push(`p.activo=$${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    cond.push(`c.nombre ILIKE $${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const colSort = SORT_VALIDO[sort] ?? 'p.fecha_inicio';
  const dir = order === 'asc' ? 'ASC' : 'DESC';

  const { rows: [tot] } = await pool.query(
    `SELECT count(*)::int AS total,
            COALESCE(SUM(p.saldo_pendiente) FILTER (WHERE p.activo), 0) AS saldo_activo,
            COALESCE(SUM(p.cuota_quincena) FILTER (WHERE p.activo), 0) AS cuota_activa,
            count(*) FILTER (WHERE p.activo)::int AS activos
     FROM prestamos p JOIN colaboradores c ON c.id=p.colaborador_id ${where}`,
    params
  );

  const limite = Math.min(Math.max(parseInt(per_page) || 10, 1), 100);
  const pag = Math.max(parseInt(page) || 1, 1);
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS colaborador_nombre,
            (SELECT count(*)::int FROM abonos_prestamo a WHERE a.prestamo_id=p.id) AS abonos
     FROM prestamos p JOIN colaboradores c ON c.id=p.colaborador_id
     ${where} ORDER BY ${colSort} ${dir}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limite, (pag - 1) * limite]
  );
  res.json({
    data: rows, total: tot.total, page: pag, per_page: limite,
    resumen: { activos: tot.activos, saldo_activo: tot.saldo_activo, cuota_activa: tot.cuota_activa },
  });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS colaborador_nombre FROM prestamos p
     JOIN colaboradores c ON c.id=p.colaborador_id WHERE p.id=$1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const { rows: abonos } = await pool.query(
    `SELECT a.*, u.email AS registrado_por_email FROM abonos_prestamo a
     LEFT JOIN usuarios u ON u.id=a.registrado_por
     WHERE a.prestamo_id=$1 ORDER BY a.creado_en DESC`,
    [req.params.id]
  );
  res.json({ ...rows[0], abonos_detalle: abonos });
});

router.post('/', async (req, res) => {
  const { colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas } = req.body;
  if (!colaborador_id || !monto_total || !cuota_quincena || !fecha_inicio) {
    return res.status(400).json({ error: 'campos requeridos' });
  }
  if (Number(monto_total) <= 0 || Number(cuota_quincena) <= 0) {
    return res.status(400).json({ error: 'monto y cuota deben ser mayores a 0' });
  }
  if (Number(cuota_quincena) > Number(monto_total)) {
    return res.status(400).json({ error: 'la cuota no puede superar el monto total' });
  }
  // saldo_pendiente arranca en monto_total (=$2).
  const { rows } = await pool.query(
    `INSERT INTO prestamos (colaborador_id, monto_total, cuota_quincena, saldo_pendiente, fecha_inicio, notas)
     VALUES ($1,$2,$3,$2,$4,$5) RETURNING *`,
    [colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  if ('cuota_quincena' in req.body && !(Number(req.body.cuota_quincena) > 0)) {
    return res.status(400).json({ error: 'la cuota debe ser mayor a 0' });
  }
  const campos = ['cuota_quincena', 'activo', 'notas'];
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
    `UPDATE prestamos SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

// Abono extraordinario o precancelación (sin body.monto = paga todo el saldo).
// Reduce el saldo; al llegar a 0 el préstamo se desactiva y deja de descontarse.
router.post('/:id/abonos', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM prestamos WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no encontrado' });
    }
    const saldo = Number(rows[0].saldo_pendiente);
    if (saldo <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'el préstamo ya está saldado' });
    }
    const monto = round2(req.body?.monto != null ? Number(req.body.monto) : saldo);
    if (!(monto > 0) || monto > saldo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `el abono debe estar entre 0.01 y ${saldo}` });
    }
    const nuevoSaldo = round2(saldo - monto);
    await client.query(
      `INSERT INTO abonos_prestamo (prestamo_id, monto, notas, registrado_por) VALUES ($1,$2,$3,$4)`,
      [req.params.id, monto, req.body?.notas ?? (monto === saldo ? 'Precancelación' : null), req.usuario.id]
    );
    const { rows: upd } = await client.query(
      `UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3 RETURNING *`,
      [nuevoSaldo, nuevoSaldo > 0, req.params.id]
    );
    await client.query('COMMIT');
    res.status(201).json(upd[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Eliminar solo préstamos sin pagos aplicados (ni cuotas de nómina ni abonos);
// si ya tiene pagos, la vía correcta es precancelar (conserva la auditoría).
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.saldo_pendiente, p.monto_total,
            (SELECT count(*)::int FROM abonos_prestamo a WHERE a.prestamo_id=p.id) AS abonos
     FROM prestamos p WHERE p.id=$1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  if (rows[0].abonos > 0 || Number(rows[0].saldo_pendiente) < Number(rows[0].monto_total)) {
    return res.status(409).json({ error: 'tiene pagos aplicados: usa precancelar en lugar de eliminar' });
  }
  await pool.query('DELETE FROM prestamos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
