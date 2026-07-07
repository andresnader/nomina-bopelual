import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { colaborador_id: '', numero_factura: '', fecha_factura: '', monto_bruto: '' };

export default function Proveedores() {
  const [facturas, setFacturas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/facturas').then(setFacturas).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
    api.get('/colaboradores?tipo=EXTERNO').then(setProveedores).catch(() => {});
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/facturas', { ...form, monto_bruto: Number(form.monto_bruto) });
      setForm(VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const marcarPagada = async (id) => {
    await api.patch(`/facturas/${id}`, { estado: 'PAGADA' });
    cargar();
  };

  return (
    <div>
      <PageTitle>Proveedores / Facturas</PageTitle>
      {error && <Card className="mb-4 text-red-300">{error}</Card>}

      <Card className="mb-4">
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <select required value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm">
            <option value="">Proveedor…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <input placeholder="N° factura" value={form.numero_factura}
            onChange={(e) => setForm({ ...form, numero_factura: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
          <input required type="date" value={form.fecha_factura}
            onChange={(e) => setForm({ ...form, fecha_factura: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
          <input required type="number" step="0.01" placeholder="Monto bruto" value={form.monto_bruto}
            onChange={(e) => setForm({ ...form, monto_bruto: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
          <button className="bg-brand-yellow text-brand-darker font-semibold px-4 py-2 rounded-lg text-sm md:col-span-4">
            Registrar factura (retención 10% automática)
          </button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr className="border-b border-white/5">
              <th className="p-3">Proveedor</th>
              <th className="p-3">Factura</th>
              <th className="p-3 text-right">Bruto</th>
              <th className="p-3 text-right">Retención</th>
              <th className="p-3 text-right">Neto</th>
              <th className="p-3">Estado</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id} className="border-b border-white/5">
                <td className="p-3">{f.colaborador_nombre}</td>
                <td className="p-3">{f.numero_factura || '—'} · {fecha(f.fecha_factura)}</td>
                <td className="p-3 text-right">{money(f.monto_bruto)}</td>
                <td className="p-3 text-right">{money(f.retencion_10pct)}</td>
                <td className="p-3 text-right font-semibold">{money(f.neto)}</td>
                <td className="p-3"><Badge estado={f.estado} /></td>
                <td className="p-3">
                  {f.estado === 'PENDIENTE' && (
                    <button onClick={() => marcarPagada(f.id)} className="text-green-300 text-xs">
                      Marcar pagada
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
