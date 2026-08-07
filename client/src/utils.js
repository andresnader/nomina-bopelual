export const money = (n) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(n || 0));

// `new Date('2026-07-01')` se interpreta como medianoche UTC — en un huso
// horario detrás de UTC (Ecuador, UTC-5) eso muestra el día anterior
// (toLocaleDateString cae al huso local). Se arma la fecha con el
// constructor (y,m,d), que siempre interpreta en huso local, para que el
// día calendario mostrado sea el mismo que viene en el string sin importar
// el huso del navegador.
export const fecha = (d) => {
  if (!d) return '—';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('es-EC');
};

// Agrupa roles de pago por empresa y suma su neto, para el pie de la tabla del
// período. `neto` llega como string desde Postgres (numeric), y acumular floats
// de dos decimales arrastra error binario (0.1+0.2 = 0.30000000000000004), así
// que se redondea una sola vez al cerrar cada grupo.
export function totalesPorEmpresa(filas) {
  const porEmpresa = new Map();
  for (const f of filas) {
    const empresa = f.colaborador_empresa || 'Sin empresa';
    const acc = porEmpresa.get(empresa) ?? { empresa, cantidad: 0, neto: 0 };
    acc.cantidad += 1;
    acc.neto += Number(f.neto || 0);
    porEmpresa.set(empresa, acc);
  }
  return [...porEmpresa.values()]
    .map((g) => ({ ...g, neto: Math.round(g.neto * 100) / 100 }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa, 'es'));
}

export function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

export function base64ABlob(b64, tipo) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}
