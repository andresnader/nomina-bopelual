import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { colaborador_id: '', monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' };

export default function Prestamos() {
  const [lista, setLista] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/prestamos').then(setLista).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
    api.get('/colaboradores?activo=true').then(setColaboradores).catch(() => {});
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/prestamos', {
        ...form,
        monto_total: Number(form.monto_total),
        cuota_quincena: Number(form.cuota_quincena)
      });
      setForm(VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageTitle>Préstamos</PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <Card className="mb-4">
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <select required value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
            className="input w-full">
            <option value="">Colaborador…</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <input required type="number" step="0.01" placeholder="Monto total" value={form.monto_total}
            onChange={(e) => setForm({ ...form, monto_total: e.target.value })}
            className="input w-full" />
          <input required type="number" step="0.01" placeholder="Cuota por quincena" value={form.cuota_quincena}
            onChange={(e) => setForm({ ...form, cuota_quincena: e.target.value })}
            className="input w-full" />
          <input required type="date" value={form.fecha_inicio}
            onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
            className="input w-full" />
          <button className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm md:col-span-4">
            Registrar préstamo
          </button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Colaborador</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Desde</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b border-slate-200">
                <td className="p-3">{p.colaborador_nombre}</td>
                <td className="p-3 text-right">{money(p.monto_total)}</td>
                <td className="p-3 text-right">{money(p.cuota_quincena)}</td>
                <td className="p-3 text-right font-semibold">{money(p.saldo_pendiente)}</td>
                <td className="p-3"><Badge estado={p.activo ? 'PENDIENTE' : 'PAGADO'} /></td>
                <td className="p-3">{fecha(p.fecha_inicio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
