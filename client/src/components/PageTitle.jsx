export default function PageTitle({ children, accion }) {
  return (
    <div className="flex items-center justify-between mb-6 gap-4 flex-wrap animate-fade-in">
      <h1 className="text-2xl font-display font-bold text-slate-100">{children}</h1>
      {accion && <div className="flex gap-2">{accion}</div>}
    </div>
  );
}
