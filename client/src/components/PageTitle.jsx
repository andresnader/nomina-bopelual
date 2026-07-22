import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function PageTitle({ children, accion, volver }) {
  return (
    <div className="mb-6 animate-fade-in">
      {volver && (
        <Link to={volver.to} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-gold-600 mb-2">
          <ChevronLeft size={16} /> {volver.label || 'Volver'}
        </Link>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-display font-bold text-slate-900">{children}</h1>
        {accion && <div className="flex gap-2">{accion}</div>}
      </div>
    </div>
  );
}
