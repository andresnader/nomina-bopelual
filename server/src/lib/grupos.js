// Un colaborador pertenece a un único grupo de pago del período, derivado de su
// tipo y clasificación. Fuente única de esta regla (la usan el TXT por grupo,
// la aprobación por grupo y el bloqueo de edición).
export function grupoDeColaborador(tipo, clasificacion) {
  if (tipo === 'EXTERNO') return 'SERV_PROF';
  return clasificacion === 'COMERCIAL' ? 'COMERCIAL' : 'ADM';
}

export const ETIQUETA_GRUPO = {
  COMERCIAL: 'Comercial',
  ADM: 'Administrativo',
  SERV_PROF: 'Serv. Profesionales',
};

// Misma regla que grupoDeColaborador pero como expresión SQL sobre un alias `c`
// de colaboradores. Úsese en consultas que agrupan/derivan el grupo.
export const SQL_GRUPO = `CASE
    WHEN c.tipo = 'EXTERNO' THEN 'SERV_PROF'
    WHEN c.clasificacion = 'COMERCIAL' THEN 'COMERCIAL'
    ELSE 'ADM' END`;
