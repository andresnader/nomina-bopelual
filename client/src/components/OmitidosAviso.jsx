import { AlertTriangle } from 'lucide-react';

// Por qué un colaborador activo no entró al período. Los motivos los define el
// servidor (services/periodos.js → colaboradoresOmitidos); acá solo se
// traducen a algo accionable para quien arma la nómina.
export const MOTIVO_OMISION = {
  SIN_CONTRATO: 'Sin sueldo cargado — agregale un contrato en su ficha',
  SIN_VINCULO: 'Sin vínculo de empresa que cubra estas fechas',
  SALIDA_PREVIA: 'Salió antes del cierre — su liquidación va aparte',
};

// Lista de colaboradores que quedaron fuera de un período. La usan el wizard
// de mes nuevo y la ficha de un período ya creado.
export default function OmitidosAviso({ omitidos, className = '' }) {
  if (!omitidos?.length) return null;
  return (
    <div className={`rounded-lg border border-amber-300 bg-amber-50 p-3 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle size={16} className="shrink-0" />
        {omitidos.length === 1
          ? '1 colaborador activo quedó fuera de la nómina'
          : `${omitidos.length} colaboradores activos quedaron fuera de la nómina`}
      </p>
      <ul className="mt-2 space-y-1">
        {omitidos.map((o) => (
          <li key={o.id} className="text-sm text-amber-900">
            <span className="font-medium">{o.nombre}</span>
            <span className="text-amber-700"> — {MOTIVO_OMISION[o.motivo] ?? o.motivo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
