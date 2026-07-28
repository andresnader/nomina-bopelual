import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const EMPRESAS = ['BOPELUAL S.A.', 'CARROS-YA S.A.'];
const SECCIONES = [
  { tipo: 'IESS', etiqueta: 'IESS' },
  { tipo: 'EXTERNO', etiqueta: 'Externo' },
];
const CLASIFICACIONES = [
  { valor: 'ADMINISTRATIVO', etiqueta: 'Administrativo' },
  { valor: 'COMERCIAL', etiqueta: 'Comercial' },
];

// Matriz de aprobación por combinación (empresa × tipo × clasificación), una
// celda por cada período recibido (una quincena puntual, o Q1+Q2 si se llama
// desde la vista de un mes). `periodos`: [{ id, label, grupos }] — `grupos`
// es el array que ya devuelve GET /periodos/:id (empresa,tipo,clasificacion,
// colaboradores,aprobado,etiqueta). `label` es 'Q1'/'Q2' o null si es una
// sola quincena (no hace falta distinguir).
export default function AprobacionMatriz({ periodos, onCambio }) {
  const toast = useToast();
  const [pendiente, setPendiente] = useState(null); // `${periodoId}-${tipo}-${clasif}-${empresa}` en vuelo

  const accion = async (periodoId, ruta, empresa, tipo, clasificacion) => {
    const clave = `${periodoId}-${tipo}-${clasificacion}-${empresa}`;
    setPendiente(clave);
    try {
      await api.post(`/periodos/${periodoId}/combinaciones/${ruta}`, { empresa, tipo, clasificacion });
      onCambio?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPendiente(null);
    }
  };

  return (
    <div className="space-y-4">
      {SECCIONES.map((sec) => (
        <div key={sec.tipo}>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{sec.etiqueta}</h3>
          <div className="space-y-2">
            {CLASIFICACIONES.map((clasif) => (
              <div key={clasif.valor} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted w-28 shrink-0">{clasif.etiqueta}</span>
                {EMPRESAS.map((empresa) => periodos.map((per) => {
                  const g = per.grupos?.find((x) => x.tipo === sec.tipo && x.clasificacion === clasif.valor && x.empresa === empresa);
                  const etiquetaBtn = `${empresa}${per.label ? ` ${per.label}` : ''}`;
                  if (!g) {
                    return (
                      <span key={`${empresa}-${per.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400">
                        {etiquetaBtn} — sin colaboradores
                      </span>
                    );
                  }
                  const clave = `${per.id}-${sec.tipo}-${clasif.valor}-${empresa}`;
                  const enVuelo = pendiente === clave;
                  return (
                    <button
                      key={clave}
                      disabled={enVuelo}
                      onClick={() => accion(per.id, g.aprobado ? 'reabrir' : 'aprobar', empresa, sec.tipo, clasif.valor)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${
                        g.aprobado
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      {etiquetaBtn} ({g.colaboradores}) — {g.aprobado ? 'Reabrir' : 'Aprobar'}
                    </button>
                  );
                }))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
