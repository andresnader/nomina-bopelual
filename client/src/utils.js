export const money = (n) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(n || 0));

export const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-EC') : '—');
