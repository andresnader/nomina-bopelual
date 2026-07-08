import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { numero_factura: '', fecha_factura: '', monto_bruto: '' };

// Formulario reutilizado aquí y en la pestaña "Facturas" de la ficha del proveedor.
export function FormFactura({ colaboradorId, proveedores, onCreado }) {
  const [form, setForm] = useState({ ...VACIO, colaborador_id: colaboradorId || '' });
  const toast = useToast();

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/facturas', {
        ...form,
        colaborador_id: colaboradorId || form.colaborador_id,
        monto_bruto: Number(form.monto_bruto),
      });
      setForm({ ...VACIO, colaborador_id: colaboradorId || '' });
      toast.success('Factura registrada.');
      onCreado();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
      {!colaboradorId && (
        <select required value={form.colaborador_id}
          onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
          className="input w-full">
          <option value="">Proveedor…</option>
          {(proveedores || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      )}
      <input placeholder="N° factura" value={form.numero_factura}
        onChange={(e) => setForm({ ...form, numero_factura: e.target.value })}
        className="input w-full" />
      <input required type="date" value={form.fecha_factura}
        onChange={(e) => setForm({ ...form, fecha_factura: e.target.value })}
        className="input w-full" />
      <input required type="number" step="0.01" min="0.01" placeholder="Monto bruto" value={form.monto_bruto}
        onChange={(e) => setForm({ ...form, monto_bruto: e.target.value })}
        className="input w-full" />
      <button className={`btn btn-primary ${colaboradorId ? '' : 'md:col-span-4'}`}>
        Registrar factura (retención automática según la empresa)
      </button>
    </form>
  );
}

export function TablaFacturas({ facturas, onCambio, conProveedor = true, conEmpresa = true }) {
  const toast = useToast();

  const marcarPagada = async (id) => {
    try {
      await api.patch(`/facturas/${id}`, { estado: 'PAGADA' });
      toast.success('Factura marcada como pagada.');
      onCambio();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <table className="w-full text-sm">
      <thead className="text-slate-500 text-left">
        <tr className="border-b border-slate-200">
          {conProveedor && <th className="p-3">Proveedor</th>}
          {conEmpresa && <th className="p-3">Empresa</th>}
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
          <tr key={f.id} className="border-b border-slate-200 hover:bg-slate-50">
            {conProveedor && (
              <td className="p-3">
                <Link to={`/colaboradores/${f.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                  {f.colaborador_nombre}
                </Link>
              </td>
            )}
            {conEmpresa && <td className="p-3">{f.empresa || '—'}</td>}
            <td className="p-3">{f.numero_factura || '—'} · {fecha(f.fecha_factura)}</td>
            <td className="p-3 text-right">{money(f.monto_bruto)}</td>
            <td className="p-3 text-right">{money(f.retencion_10pct)}</td>
            <td className="p-3 text-right font-semibold">{money(f.neto)}</td>
            <td className="p-3"><Badge estado={f.estado} /></td>
            <td className="p-3">
              {f.estado === 'PENDIENTE' && (
                <button onClick={() => marcarPagada(f.id)} className="text-emerald-600 text-xs hover:underline">
                  Marcar pagada
                </button>
              )}
            </td>
          </tr>
        ))}
        {facturas.length === 0 && (
          <tr><td colSpan={(conProveedor ? 1 : 0) + (conEmpresa ? 1 : 0) + 6} className="p-4 text-slate-500">Sin facturas registradas.</td></tr>
        )}
      </tbody>
    </table>
  );
}

export default function Proveedores() {
  const [facturas, setFacturas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const toast = useToast();

  const cargar = () => api.get('/facturas').then(setFacturas).catch((e) => toast.error(e.message));
  useEffect(() => {
    cargar();
    api.get('/colaboradores?tipo=EXTERNO&per_page=all').then((r) => setProveedores(r.data)).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <PageTitle>Proveedores / Facturas</PageTitle>

      <Card className="mb-4">
        <FormFactura proveedores={proveedores} onCreado={cargar} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <TablaFacturas facturas={facturas} onCambio={cargar} />
      </Card>
    </div>
  );
}
