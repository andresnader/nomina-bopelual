export default function MobileCard({ top, meta, footer, className = '' }) {
  return (
    <div className={`card p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">{top}</div>
      {meta && <div className="mobile-card-meta mt-1 text-xs text-slate-500">{meta}</div>}
      {footer && (
        <div className="mobile-card-footer mt-2 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
}
