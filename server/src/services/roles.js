import { calcularTotales } from '../lib/calculo.js';

// Relee las líneas del rol, recalcula totales y los persiste.
export async function recalcularTotales(client, rolPagoId) {
  const { rows: lineas } = await client.query(
    'SELECT clase, monto, es_provision FROM lineas_rol WHERE rol_pago_id=$1',
    [rolPagoId]
  );
  const t = calcularTotales(lineas);
  await client.query(
    'UPDATE roles_pago SET total_ingresos=$1, total_descuentos=$2, neto=$3 WHERE id=$4',
    [t.totalIngresos, t.totalDescuentos, t.neto, rolPagoId]
  );
  return { total_ingresos: t.totalIngresos, total_descuentos: t.totalDescuentos, neto: t.neto };
}
