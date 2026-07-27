// Generador del Excel de la nómina de un período. A diferencia del TXT del
// banco (que solo incluye a los marcados para pago por transferencia), el
// Excel SIEMPRE muestra a todos los colaboradores de la nómina generada:
// es el documento de respaldo completo para contabilidad/RRHH.
import XLSX from 'xlsx';

const ANCHOS_NOMINA = [
  { wch: 32 }, // Colaborador
  { wch: 12 }, // Cédula
  { wch: 16 }, // Empresa
  { wch: 10 }, // Tipo
  { wch: 20 }, // Clasificación
  { wch: 12 }, // Ingresos
  { wch: 12 }, // Descuentos
  { wch: 12 }, // Neto
  { wch: 14 }, // Forma de pago
  { wch: 14 }, // Tipo de pago
];

const ANCHOS_DETALLE = [
  { wch: 32 }, // Colaborador
  { wch: 12 }, // Clase
  { wch: 24 }, // Tipo de línea
  { wch: 48 }, // Descripción
  { wch: 12 }, // Monto
];

// roles: filas de roles_pago JOIN colaboradores (ver ruta /periodos/:id/excel).
// lineas: filas de lineas_rol de todos esos roles, con colaborador_nombre.
// Devuelve un Buffer con el .xlsx (dos hojas: resumen y detalle de líneas).
export function generarExcelNomina(roles, lineas) {
  const wb = XLSX.utils.book_new();

  const resumen = roles.map((r) => ({
    Colaborador: r.nombre,
    'Cédula': r.cedula ?? '',
    Empresa: r.empresa ?? '',
    Tipo: r.tipo,
    'Clasificación': r.tipo === 'EXTERNO' ? 'SERV. PROFESIONALES' : (r.clasificacion ?? ''),
    Ingresos: Number(r.total_ingresos),
    Descuentos: Number(r.total_descuentos),
    Neto: Number(r.neto),
    'Forma de pago': r.forma_pago ?? '',
    'Tipo de pago': r.tipo_pago ?? '',
  }));
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen['!cols'] = ANCHOS_NOMINA;
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Nómina');

  const detalle = lineas.map((l) => ({
    Colaborador: l.colaborador_nombre,
    Clase: l.clase,
    'Tipo de línea': l.tipo_linea,
    'Descripción': l.descripcion ?? '',
    Monto: Number(l.monto),
  }));
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  wsDetalle['!cols'] = ANCHOS_DETALLE;
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
