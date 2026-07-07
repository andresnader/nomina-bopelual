export default function KpiCard({ titulo, valor, sub }) {
  return (
    <div className="card-hover animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</p>
      <p className="mt-2 text-2xl font-display font-bold text-slate-900">{valor}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
