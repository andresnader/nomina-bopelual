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
              className="bg-brand-yellow text-brand-darker font-semibold px-4 py-2 rounded-lg text-sm"
            >
              Nuevo período
            </button>
          </RoleGate>
        }
      >
        Períodos
      </PageTitle>

      {msg && <Card className="mb-4 text-green-300">{msg}</Card>}
      {error && <Card className="mb-4 text-red-300">{error}</Card>}

      {form && (
        <Card className="mb-4">
          <form onSubmit={crear} className="grid md:grid-cols-2 gap-3">
            <input required placeholder="Nombre (ej: 2da quincena julio 2026)" value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm md:col-span-2" />
            <input required type="date" value={form.fecha_inicio}
              onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
            <input required type="date" value={form.fecha_fin}
              onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
              className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
            <select value={form.quincena}
              onChange={(e) => setForm({ ...form, quincena: e.target.value })}
              className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm">
              <option value={1}>1ra quincena (anticipo)</option>
              <option value={2}>2da quincena (liquidación)</option>
            </select>
            <div className="flex gap-2 md:col-span-2">
              <button className="bg-brand-yellow text-brand-darker font-semibold px-4 py-2 rounded-lg text-sm">
                Crear y generar roles
              </button>
              <button type="button" onClick={() => setForm(null)} className="text-slate-400 text-sm px-3">
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr className="border-b border-white/5">
              <th className="p-3">Período</th>
              <th className="p-3">Rango</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Total neto</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <Link to={`/periodos/${p.id}`} className="text-brand-yellow hover:underline">
                    {p.nombre}
                  </Link>
                </td>
                <td className="p-3">{fecha(p.fecha_inicio)} – {fecha(p.fecha_fin)}</td>
                <td className="p-3"><Badge estado={p.estado} /></td>
                <td className="p-3 text-right">{money(p.total_neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
