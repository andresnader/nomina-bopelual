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

router.get('/costo-departamento', async (_req, res) => {
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
  res.json(Object.values(mapa));
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
