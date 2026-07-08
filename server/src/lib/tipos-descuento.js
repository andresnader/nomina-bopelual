import pool from '../db/pool.js';

// Catálogo por defecto (usado como fallback si la tabla no existe aún).
const TIPOS_FALLBACK = [
  { tipo: 'ALIMENTACION', label: 'Alimentación' },
  { tipo: 'COMISARIATO', label: 'Comisariato' },
  { tipo: 'SALUDSA', label: 'SaludSA' },
  { tipo: 'MEC', label: 'MEC' },
  { tipo: 'NEC', label: 'NEC' },
  { tipo: 'CUOTA_PLAN', label: 'Cuota plan' },
  { tipo: 'PLAN_VEHICULAR', label: 'Plan vehicular' },
  { tipo: 'UNIFORMES', label: 'Uniformes' },
  { tipo: 'SEGURO', label: 'Seguro' },
  { tipo: 'PENSION_ALIMENTICIA', label: 'Pensión alimenticia' },
  { tipo: 'LENTES', label: 'Lentes' },
  { tipo: 'ANTICIPO_SUELDO', label: 'Anticipo de sueldo' },
  { tipo: 'PRESTAMO_HIPOTECARIO', label: 'Préstamo hipotecario' },
  { tipo: 'PRESTAMO_QUIROGRAFARIO', label: 'Préstamo quirografario' },
  { tipo: 'DESCUENTO_VARIOS', label: 'Descuento varios' },
];

export async function obtenerTipos() {
  try {
    const { rows } = await pool.query(
      'SELECT codigo AS tipo, nombre AS label FROM servicios_descuento WHERE activo=true ORDER BY codigo'
    );
    return rows.length ? rows : TIPOS_FALLBACK;
  } catch {
    return TIPOS_FALLBACK;
  }
}

export async function esTipoDescuentoValido(tipo) {
  const tipos = await obtenerTipos();
  return tipos.some((t) => t.tipo === tipo);
}
