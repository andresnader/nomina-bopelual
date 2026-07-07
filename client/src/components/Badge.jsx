const ESTILOS = {
  BORRADOR: 'badge-gold',
  APROBADO: 'badge-blue',
  CERRADO: 'badge-green',
  PENDIENTE: 'badge-slate',
  PAGADO: 'badge-green',
  PAGADA: 'badge-green',
  IESS: 'bg-gold-400/15 text-gold-400',
  EXTERNO: 'bg-purple-400/15 text-purple-400'
};

export default function Badge({ estado }) {
  return (
    <span className={`${ESTILOS[estado] || ESTILOS.PENDIENTE}`}>
      {estado}
    </span>
  );
}
