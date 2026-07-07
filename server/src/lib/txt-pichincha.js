// Generador del archivo de pago masivo "Cash Management" de Banco Pichincha.
// Formato observado en los TXT reales del proceso manual (cash_management_pich_min_*.TXT):
// 12 campos separados por TAB, una línea por transferencia, fin de línea CRLF:
//   PA  <ref>  USD  <monto en centavos>  CTA  <AHO|CTE>  <cuenta>  <descripción>  C  <cédula>  <nombre>  <código banco>
// El monto va en centavos sin separador decimal (19000 = $190.00).

const TIPO_CUENTA = { AHORRO: 'AHO', CORRIENTE: 'CTE' };

// El banco solo acepta ASCII: BOLOÑA → BOLONA, ANDRÉS → ANDRES.
const ascii = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

export function lineaPago(seq, pago, descripcion) {
  const faltantes = ['cuenta_bancaria', 'cedula', 'codigo_banco'].filter((c) => !pago[c]);
  if (faltantes.length) {
    throw new Error(`pago de ${pago.nombre ?? '?'} sin ${faltantes.join(', ')}`);
  }
  return [
    'PA',
    String(seq),
    'USD',
    String(Math.round(Number(pago.neto) * 100)),
    'CTA',
    TIPO_CUENTA[pago.tipo_cuenta] ?? 'AHO',
    pago.cuenta_bancaria,
    descripcion,
    'C',
    pago.cedula,
    ascii(pago.nombre),
    String(Number(pago.codigo_banco)),
  ].join('\t');
}

// pagos: [{ neto, tipo_cuenta, cuenta_bancaria, cedula, nombre, codigo_banco }]
// Devuelve el contenido del archivo (CRLF, termina con CRLF).
export function generarTxtPichincha(pagos, descripcion) {
  return pagos.map((p, i) => lineaPago(i + 1, p, descripcion)).join('\r\n') + '\r\n';
}
