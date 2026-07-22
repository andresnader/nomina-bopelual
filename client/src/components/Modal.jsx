import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const anchos = { sm: 'md:max-w-sm', md: 'md:max-w-md', lg: 'md:max-w-lg' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center md:items-center md:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`relative w-full h-full md:h-auto ${anchos[size]} bg-white md:rounded-xl shadow-xl animate-slide-up flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-4">
          <h2 className="font-display font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 -m-3 p-3 md:m-0 md:p-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// --- Confirmación basada en promesas: reemplaza confirm() nativo ---
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [estado, setEstado] = useState(null); // { title, message, confirmLabel, danger, resolve }

  const confirm = useCallback(({ title = 'Confirmar', message, confirmLabel = 'Confirmar', danger = false }) => {
    return new Promise((resolve) => {
      setEstado({ title, message, confirmLabel, danger, resolve });
    });
  }, []);

  const cerrar = (valor) => {
    estado?.resolve(valor);
    setEstado(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!estado} onClose={() => cerrar(false)} title={estado?.title} size="sm"
        footer={
          <>
            <button onClick={() => cerrar(false)} className="btn btn-secondary">Cancelar</button>
            <button onClick={() => cerrar(true)} className={estado?.danger ? 'btn btn-danger' : 'btn btn-primary'}>
              {estado?.confirmLabel}
            </button>
          </>
        }>
        <p className="text-sm text-slate-600">{estado?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}
