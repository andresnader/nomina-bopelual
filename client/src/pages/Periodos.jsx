import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { nombre: '', fecha_inicio: '', fecha_fin: '', quincena: 1 };

export default function Periodos() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/periodos').then(setLista).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post('/periodos', { ...form, quincena: Number(form.quincena) });
      setMsg(`Período creado con ${res.creados} rol(es) generados.`);
      setForm(null);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
        <PageTitle
          accion={
            <RoleGate roles={['ADMIN', 'RRHH']}>
              <button
                onClick={() => setForm(VACIO)}
                className="btn-primary"
              >
                Nuevo período
              </button>
            </RoleGate>
          }
        >
          Períodos
        </PageTitle>

      {msg && <div className="mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm animate-slide-up">{msg}</div>}
      {error && <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-slide-up">{error}</div>}

      {form && (
        <Card className="mb-6 animate-slide-up">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Nuevo período de pago</h2>
          <form onSubmit={crear} className="grid md:grid-cols-2 gap-4">
            <input required placeholder="Nombre (ej: 2da quincena julio 2026)" value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="input md:col-span-2" />
            <div>
              <label className="label">Fecha inicio</label>
              <input required type="date" value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="input" />
            </div>
            <div>
              <label className="label">Fecha fin</label>
              <input required type="date" value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className="input" />
            </div>
            <div>
              <label className="label">Quincena</label>
              <select value={form.quincena}
                onChange={(e) => setForm({ ...form, quincena: e.target.value })}
                className="input">
                <option value={1}>1ra quincena (40% anticipo)</option>
                <option value={2}>2da quincena (60% + beneficios)</option>
              </select>
            </div>
            <div className="flex gap-3 items-end md:col-span-2">
              <button className="btn-primary">Crear y generar roles</button>
              <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
            </div>
          </form>
        </Card>
      )}

      <div className="card p-0 overflow-hidden animate-fade-in">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-600/30">
              <th className="table-header p-4 text-left">Período</th>
              <th className="table-header p-4 text-left">Rango</th>
              <th className="table-header p-4 text-left">Estado</th>
              <th className="table-header p-4 text-right">Total neto</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b border-brand-600/20 hover:bg-brand-700/40 transition-colors">
                <td className="p-4">
                  <Link to={`/periodos/${p.id}`} className="link text-sm font-medium">
                    {p.nombre}
                  </Link>
                </td>
                <td className="p-4 text-slate-300">{fecha(p.fecha_inicio)} – {fecha(p.fecha_fin)}</td>
                <td className="p-4"><Badge estado={p.estado} /></td>
                <td className="p-4 text-right font-medium text-slate-200">{money(p.total_neto)}</td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">No hay períodos registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
