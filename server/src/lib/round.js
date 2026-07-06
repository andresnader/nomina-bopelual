// Redondeo estable a 2 decimales, evitando el arrastre de error de punto flotante.
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
