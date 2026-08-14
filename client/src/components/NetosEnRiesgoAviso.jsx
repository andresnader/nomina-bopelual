import { AlertTriangle } from 'lucide-react';
import { money } from '../utils.js';

// Roles que no se pueden pagar tal como están. Un neto negativo significa que
// los descuentos superaron a los ingresos (préstamos duplicados, cuotas que se
// acumularon en la misma quincena): el banco no puede procesar un pago así, y
// hasta ahora el número quedaba perdido entre las filas de la tabla.
export default function NetosEnRiesgoAviso({ roles }) {
  const negativos = (roles ?? []).filter((r) => Number(r.neto) < 0);
  const enCero = (roles ?? []).filter((r) => Number(r.neto) === 0);
  if (negativos.length === 0 && enCero.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 mb-4">
      {negativos.length > 0 && (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
            <AlertTriangle size={16} className="shrink-0" />
            {negativos.length === 1
              ? 'Un rol quedó en negativo: no se puede pagar'
              : `${negativos.length} roles quedaron en negativo: no se pueden pagar`}
          </p>
          <ul className="mt-2 space-y-1">
            {negativos.map((r) => (
              <li key={r.id} className="text-sm text-red-900">
                <span className="font-medium">{r.colaborador_nombre}</span>
                <span className="text-red-700"> — neto {money(r.neto)}, los descuentos superan a los ingresos</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {enCero.length > 0 && (
        <div className={negativos.length > 0 ? 'mt-3 pt-3 border-t border-red-200' : ''}>
          <p className="text-sm font-semibold text-red-900">
            {enCero.length === 1
              ? 'Un rol quedó sin nada que pagar'
              : `${enCero.length} roles quedaron sin nada que pagar`}
          </p>
          <ul className="mt-2 space-y-1">
            {enCero.map((r) => (
              <li key={r.id} className="text-sm text-red-900">
                <span className="font-medium">{r.colaborador_nombre}</span>
                <span className="text-red-700"> — neto en cero, conviene revisar su contrato y sus líneas</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
