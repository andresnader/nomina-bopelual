// Catálogo de conceptos de descuento observados en la nómina real (junio 2026).
// tipo_linea es texto libre en la BD; este catálogo alimenta los selects de la
// UI y valida las altas de descuentos recurrentes.
export const TIPOS_DESCUENTO = [
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

export const esTipoDescuentoValido = (tipo) =>
  TIPOS_DESCUENTO.some((t) => t.tipo === tipo);
