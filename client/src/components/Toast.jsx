import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);
let idSeq = 0;

const ESTILOS = {
  success: { icon: CheckCircle2, clase: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  error: { icon: XCircle, clase: 'bg-red-50 border-red-200 text-red-800' },
  info: { icon: Info, clase: 'bg-slate-50 border-slate-200 text-slate-800' },
  warning: { icon: AlertTriangle, clase: 'bg-amber-50 border-amber-200 text-amber-900' },
};

// Las advertencias no se autocierran: avisan de algo que saldrá mal más tarde
// (p. ej. un colaborador que quedará fuera de una quincena), y a los 4 segundos
// nadie ha terminado de leerlas.
const PERSISTENTES = new Set(['warning']);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const quitar = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const mostrar = useCallback((tipo, mensaje) => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, tipo, mensaje }]);
    if (!PERSISTENTES.has(tipo)) setTimeout(() => quitar(id), 4000);
  }, [quitar]);

  const api = {
    success: (m) => mostrar('success', m),
    error: (m) => mostrar('error', m),
    info: (m) => mostrar('info', m),
    warning: (m) => mostrar('warning', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => {
          const { icon: Icon, clase } = ESTILOS[t.tipo];
          return (
            <div key={t.id} role="alert"
              className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm shadow-lg animate-slide-up ${clase}`}>
              <Icon size={18} className="shrink-0 mt-0.5" />
              <p className="flex-1">{t.mensaje}</p>
              <button onClick={() => quitar(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
