// Máquina de estados del período. CERRADO es terminal (irreversible).
const TRANSICIONES = {
  BORRADOR: { aprobar: 'APROBADO' },
  APROBADO: { cerrar: 'CERRADO' },
  CERRADO: {}
};

export function siguienteEstado(estadoActual, accion) {
  const destino = TRANSICIONES[estadoActual]?.[accion];
  if (!destino) throw new Error(`Transición inválida: ${estadoActual} --${accion}-->`);
  return destino;
}

// Las líneas del rol solo se editan mientras el período está en BORRADOR.
export function puedeEditarLineas(estado) {
  return estado === 'BORRADOR';
}
