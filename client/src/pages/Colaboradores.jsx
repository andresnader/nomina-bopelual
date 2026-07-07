import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { fecha } from '../utils.js';

const VACIO = { tipo: 'IESS', nombre: '', cedula: '', email: '', departamento: '', cargo: '', fecha_ingreso: '' };

export default function Colaboradores() {
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const cargar = () =>
    api.get('/colaboradores').then(setLista).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.post('/colaboradores', { ...form, fecha_ingreso: form.fecha_ingreso || null });
      setForm(null);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const visibles = lista.filter((c) => c.nombre.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div>
      <PageTitle
        accion={
          <button
            onClick={() => setForm(VACIO)}
            className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Nuevo colaborador
          </button>
        }
      >
        Colaboradores
      </PageTitle>

      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <input
        placeholder="Buscar por nombre…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        className="input w-full mb-4"
      />

      {form && (
        <Card className="mb-4">
          <form onSubmit={guardar} className="grid md:grid-cols-2 gap-3">
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="input w-full"
            >
              <option value="IESS">IESS</option>
              <option value="EXTERNO">EXTERNO</option>
            </select>
            <input required placeholder="Nombre" value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="input w-full" />
            <input placeholder="Cédula/RUC" value={form.cedula}
              onChange={(e) => setForm({ ...form, cedula: e.target.value })}
              className="input w-full" />
            <input placeholder="Departamento" value={form.departamento}
              onChange={(e) => setForm({ ...form, departamento: e.target.value })}
              className="input w-full" />
            <input placeholder="Cargo" value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              className="input w-full" />
            <input type="date" value={form.fecha_ingreso}
              onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
              className="input w-full" />
            <div className="flex gap-2 md:col-span-2">
              <button className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm">
                Guardar
              </button>
              <button type="button" onClick={() => setForm(null)} className="text-slate-500 text-sm px-3">
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Nombre</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Departamento</th>
              <th className="p-3">Ingreso</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3">
                  <Link to={`/colaboradores/${c.id}`} className="text-gold-600 font-medium hover:underline">
                    {c.nombre}
                  </Link>
                </td>
                <td className="p-3"><Badge estado={c.tipo} /></td>
                <td className="p-3">{c.departamento || '—'}</td>
                <td className="p-3">{fecha(c.fecha_ingreso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
