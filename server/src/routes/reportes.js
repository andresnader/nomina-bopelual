import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { iessPatronal } from '../lib/calculo.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH', 'GERENCIA']));

// Neutraliza inyección de fórmulas: una celda que empiece con = + - @ (o tab/CR)
// es interpretada como fórmula por Excel/Sheets. Se antepone un apóstrofo.
function sanitizarCsv(valor) {
  const s = String(valor);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function aCsv(filas, columnas) {
  const escapar = (v) => {
    const s = sanitizarCsv(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columnas.join(',');
  const cuerpo = filas.map((f) => columnas.map((c) => escapar(f[c])).join(',')).join('\n');
  return `${head}\n${cuerpo}\n`;
}

router.get('/periodo/:id.csv', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.nombre AS colaborador, c.tipo, rp.total_ingresos, rp.total_descuentos, rp.neto
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 ORDER BY c.nombre`,
    [req.params.id]
  );
  const csv = aCsv(rows, ['colaborador', 'tipo', 'total_ingresos', 'total_descuentos', 'neto']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="periodo-${req.params.id}.csv"`);
  res.send(csv);
});

router.get('/costo-departamento', async (req, res) => {
  const { periodo_id } = req.query;
  if (!periodo_id) {
    // Proyección actual: sueldo + aporte patronal de contratos vigentes (sin cambios).
    const { rows } = await pool.query(
      `SELECT c.departamento, ct.sueldo_base
       FROM colaboradores c JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
       WHERE c.activo=true AND c.tipo='IESS'`
    );
    const mapa = {};
    for (const r of rows) {
      const dep = r.departamento || 'Sin depto';
      mapa[dep] ??= { departamento: dep, total_sueldos: 0, aporte_patronal: 0 };
      mapa[dep].total_sueldos += Number(r.sueldo_base);
      mapa[dep].aporte_patronal += iessPatronal(Number(r.sueldo_base));
    }
    return res.json(Object.values(mapa));
  }
  // Costo real de un período específico: ingresos/descuentos/neto agregados por departamento.
  const { rows } = await pool.query(
    `SELECT COALESCE(c.departamento,'Sin depto') AS departamento,
            COALESCE(SUM(rp.total_ingresos),0) AS total_ingresos,
            COALESCE(SUM(rp.total_descuentos),0) AS total_descuentos,
            COALESCE(SUM(rp.neto),0) AS neto
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1
     GROUP BY departamento ORDER BY departamento`,
    [periodo_id]
  );
  res.json(rows);
});

async function evolucionMensual() {
  const { rows } = await pool.query(
    `SELECT p.nombre, p.fecha_inicio,
            COALESCE(SUM(rp.total_ingresos),0) AS total_ingresos,
            COALESCE(SUM(rp.total_descuentos),0) AS total_descuentos,
            COALESCE(SUM(rp.neto),0) AS neto
     FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
     GROUP BY p.id ORDER BY p.fecha_inicio`
  );
  return rows;
}
router.get('/evolucion-mensual', async (_req, res) => res.json(await evolucionMensual()));
router.get('/evolucion-mensual.csv', async (_req, res) => {
  const csv = aCsv(await evolucionMensual(), ['nombre', 'fecha_inicio', 'total_ingresos', 'total_descuentos', 'neto']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="evolucion-mensual.csv"');
  res.send(csv);
});

async function retencionesProveedor() {
  const { rows } = await pool.query(
    `SELECT c.nombre AS proveedor, date_trunc('month', f.fecha_factura)::date AS mes,
            COALESCE(SUM(f.monto_bruto),0) AS total_bruto,
            COALESCE(SUM(f.retencion_10pct),0) AS total_retencion,
            COALESCE(SUM(f.neto),0) AS total_neto
     FROM facturas_proveedor f JOIN colaboradores c ON c.id=f.colaborador_id
     GROUP BY c.nombre, mes ORDER BY mes DESC, c.nombre`
  );
  return rows;
}
router.get('/retenciones-proveedor', async (_req, res) => res.json(await retencionesProveedor()));
router.get('/retenciones-proveedor.csv', async (_req, res) => {
  const csv = aCsv(await retencionesProveedor(), ['proveedor', 'mes', 'total_bruto', 'total_retencion', 'total_neto']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="retenciones-proveedor.csv"');
  res.send(csv);
});

async function provisionesPorAnio(anio) {
  const { rows } = await pool.query(
    `SELECT c.nombre AS colaborador, pr.anio, pr.decimo_tercero, pr.decimo_cuarto, pr.fondos_reserva, pr.utilidades
     FROM provisiones pr JOIN colaboradores c ON c.id=pr.colaborador_id
     WHERE pr.anio=$1 ORDER BY c.nombre`,
    [anio]
  );
  return rows;
}
router.get('/provisiones', async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  res.json(await provisionesPorAnio(anio));
});
router.get('/provisiones.csv', async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const csv = aCsv(await provisionesPorAnio(anio), ['colaborador', 'anio', 'decimo_tercero', 'decimo_cuarto', 'fondos_reserva', 'utilidades']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="provisiones-${anio}.csv"`);
  res.send(csv);
});

// Desglose de décimo tercero/cuarto y fondos de reserva de UN período
// específico (no acumulado anual como /provisiones), para conciliar contra
// el rol de pago real de ese mes. Solo se expone si el período ya está
// CERRADO, para no mostrarle a contabilidad cifras que aún pueden cambiar.
async function periodoCerrado(periodoId) {
  const { rows } = await pool.query('SELECT estado FROM periodos WHERE id=$1', [periodoId]);
  if (rows.length === 0) return { codigo: 404, mensaje: 'período no encontrado' };
  if (rows[0].estado !== 'CERRADO') return { codigo: 400, mensaje: 'el período no está cerrado' };
  return null;
}

async function decimosPorPeriodo(periodoId) {
  const { rows } = await pool.query(
    `SELECT c.nombre AS colaborador,
            COALESCE(SUM(l.monto) FILTER (WHERE l.tipo_linea='DECIMO_TERCERO'), 0) AS decimo_tercero,
            COALESCE(SUM(l.monto) FILTER (WHERE l.tipo_linea='DECIMO_CUARTO'), 0) AS decimo_cuarto,
            COALESCE(SUM(l.monto) FILTER (WHERE l.tipo_linea='FONDOS_RESERVA'), 0) AS fondos_reserva
     FROM lineas_rol l
     JOIN roles_pago rp ON rp.id=l.rol_pago_id
     JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 AND l.tipo_linea IN ('DECIMO_TERCERO','DECIMO_CUARTO','FONDOS_RESERVA')
     GROUP BY c.nombre ORDER BY c.nombre`,
    [periodoId]
  );
  return rows;
}

router.get('/decimos-periodo', async (req, res) => {
  const { periodo_id } = req.query;
  if (!periodo_id) return res.status(400).json({ error: 'periodo_id requerido' });
  const err = await periodoCerrado(periodo_id);
  if (err) return res.status(err.codigo).json({ error: err.mensaje });
  res.json(await decimosPorPeriodo(periodo_id));
});
router.get('/decimos-periodo.csv', async (req, res) => {
  const { periodo_id } = req.query;
  if (!periodo_id) return res.status(400).json({ error: 'periodo_id requerido' });
  const err = await periodoCerrado(periodo_id);
  if (err) return res.status(err.codigo).json({ error: err.mensaje });
  const csv = aCsv(await decimosPorPeriodo(periodo_id), ['colaborador', 'decimo_tercero', 'decimo_cuarto', 'fondos_reserva']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="decimos-periodo-${periodo_id}.csv"`);
  res.send(csv);
});

router.get('/documentos-faltantes', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.tipo, c.empresa
     FROM colaboradores c
     WHERE c.activo=true
       AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.colaborador_id=c.id)
     ORDER BY c.nombre`
  );
  res.json(rows);
});

export default router;
