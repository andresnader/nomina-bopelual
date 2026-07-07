const ESTILOS = {
  BORRADOR: 'badge-gold',
  APROBADO: 'badge-blue',
  CERRADO: 'badge-green',
  PENDIENTE: 'badge-slate',
  PAGADO: 'badge-green',
  PAGADA: 'badge-green',
  IESS: 'badge bg-gold-100 text-gold-800',
  EXTERNO: 'badge bg-purple-100 text-purple-700'
};

export default function Badge({ estado }) {
  return (
    <span className={`${ESTILOS[estado] || ESTILOS.PENDIENTE}`}>
      {estado}
    </span>
  );
}
