import pool from '../db/pool.js';

// Catálogo por defecto (usado como fallback si la tabla no existe aún).
const TIPOS_FALLBACK = [
  { tipo: 'PRODUCTIVO', label: 'Contrato productivo' },
  { tipo: 'INDEFINIDO', label: 'Contrato indefinido' },
  { tipo: 'ESPECIAL_EMERGENTE', label: 'Contrato especial emergente' },
  { tipo: 'JUVENIL', label: 'Contrato juvenil' },
  { tipo: 'TEMPORAL', label: 'Contrato temporal' },
];

export async function obtenerTiposContrato() {
  try {
    const { rows } = await pool.query(
      'SELECT codigo AS tipo, nombre AS label FROM tipos_contrato WHERE activo=true ORDER BY codigo'
    );
    return rows.length ? rows : TIPOS_FALLBACK;
  } catch {
    return TIPOS_FALLBACK;
  }
}

export async function esTipoContratoValido(tipo) {
  const tipos = await obtenerTiposContrato();
  return tipos.some((t) => t.tipo === tipo);
}
