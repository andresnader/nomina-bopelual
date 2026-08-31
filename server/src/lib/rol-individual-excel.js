// Generador del "Rol de Pagos Individual" mensual, formato histórico de la
// empresa: encabezado, datos del colaborador, dos columnas ingresos/egresos
// y un total. Sigue el patrón de excel-nomina.js (misma librería `xlsx`),
// pero construido celda por celda (aoa_to_sheet) para lograr el layout de
// encabezado + dos columnas en vez de una tabla plana.
import XLSX from 'xlsx';

function money(n) {
  return round2(n);
}
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function generarRolIndividualExcel(datos) {
  const { empresa, colaborador, periodo, diasTrabajados, ingresos, totalIngresos, egresos, totalEgresos, totalARecibir } = datos;

  const filas = [
    [empresa.empresa],
    [[empresa.direccion, empresa.telefonos].filter(Boolean).join('   ')],
    [],
    ['ROL DE PAGOS INDIVIDUAL', '', '', `Período ${periodo.desde} - ${periodo.hasta}`],
    [`EMPLEADO: ${colaborador.nombre}`, '', '', `C.I.: ${colaborador.cedula ?? ''}`],
    [`DIAS TRABAJADOS: ${diasTrabajados}`],
    [`PROVINCIA: ${colaborador.provincia ?? ''}`, '', '', `CIUDAD: ${colaborador.ciudad ?? ''}`],
    [`CARGO: ${colaborador.cargo ?? ''}`],
    [],
    ['INGRESOS', '', 'EGRESOS'],
  ];

  const filasIngresos = ingresos.map((i) => [i.label, money(i.monto)]);
  const filasEgresos = egresos.map((e) => [e.label, money(e.monto)]);
  const maxFilas = Math.max(filasIngresos.length, filasEgresos.length);
  for (let i = 0; i < maxFilas; i++) {
    const [ingLabel, ingMonto] = filasIngresos[i] ?? ['', ''];
    const [egLabel, egMonto] = filasEgresos[i] ?? ['', ''];
    filas.push([ingLabel, ingMonto, egLabel, egMonto]);
  }

  filas.push(['Total Ingresos', money(totalIngresos), 'Total Egresos', money(totalEgresos)]);
  filas.push([]);
  filas.push(['TOTAL A RECIBIR', '', '', money(totalARecibir)]);

  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 14 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rol Individual');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
