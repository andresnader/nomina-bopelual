export default function KpiCard({ titulo, valor, sub }) {
  return (
    <div className="bg-brand-dark/60 border border-white/5 rounded-xl p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-display font-bold text-brand-yellow">{valor}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
