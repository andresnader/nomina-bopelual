import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money } from '../utils.js';

export default function Reportes() {
  const [periodos, setPeriodos] = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [costo, setCosto] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/periodos').then(setPeriodos).catch((e) => setError(e.message));
    api.get('/reportes/costo-departamento').then(setCosto).catch(() => {});
  }, []);

  // El CSV va con el token en el header; usamos fetch + blob para descargarlo.
  const descargarCsv = async () => {
    if (!seleccion) return;
    const token = localStorage.getItem('idToken');
    const res = await fetch(`/api/reportes/periodo/${seleccion}.csv`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `periodo-${seleccion}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageTitle>Reportes</PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-3">Exportar período (CSV)</h2>
        <div className="flex gap-2 flex-wrap">
          <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)}
            className="input w-full">
            <option value="">Elige un período…</option>
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <button onClick={descargarCsv} disabled={!seleccion}
            className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-40">
            Descargar CSV
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="font-display font-bold mb-3">Costo por departamento (IESS)</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Departamento</th>
              <th className="p-2 text-right">Sueldos</th>
              <th className="p-2 text-right">Aporte patronal (12.15%)</th>
            </tr>
          </thead>
          <tbody>
            {costo.map((c) => (
              <tr key={c.departamento} className="border-b border-slate-200">
                <td className="p-2">{c.departamento}</td>
                <td className="p-2 text-right">{money(c.total_sueldos)}</td>
                <td className="p-2 text-right">{money(c.aporte_patronal)}</td>
              </tr>
            ))}
            {costo.length === 0 && (
              <tr><td colSpan={3} className="p-2 text-slate-500">Sin datos.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
