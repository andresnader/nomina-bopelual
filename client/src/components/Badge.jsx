const ESTILOS = {
  BORRADOR: 'bg-yellow-500/20 text-yellow-300',
  APROBADO: 'bg-blue-500/20 text-blue-300',
  CERRADO: 'bg-green-500/20 text-green-300',
  PENDIENTE: 'bg-slate-500/20 text-slate-300',
  PAGADO: 'bg-green-500/20 text-green-300',
  PAGADA: 'bg-green-500/20 text-green-300',
  IESS: 'bg-brand-yellow/20 text-brand-yellow',
  EXTERNO: 'bg-purple-500/20 text-purple-300'
};

export default function Badge({ estado }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTILOS[estado] || ESTILOS.PENDIENTE}`}>
      {estado}
    </span>
  );
}
