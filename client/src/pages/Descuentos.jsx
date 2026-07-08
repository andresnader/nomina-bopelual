import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money } from '../utils.js';
import { useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

export const QUINCENA_LABEL = { 0: 'Ambas', 1: '1ra quincena', 2: '2da quincena' };

// Formulario reutilizado aquí y en la ficha del colaborador.
export function FormDescuento({ colaboradorId, colaboradores, onCreado, onError }) {
  const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({ colaborador_id: colaboradorId || '', tipo_linea: 'ALIMENTACION', monto: '', aplicar_en: 0, cuotas_restantes: '', notas: '' });

  useEffect(() => {
    api.get('/descuentos/tipos').then(setTipos).catch(() => {});
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/descuentos', {
        ...form,
        colaborador_id: colaboradorId || form.colaborador_id,
        aplicar_en: Number(form.aplicar_en),
        cuotas_restantes: form.cuotas_restantes ? Number(form.cuotas_restantes) : null,
      });
      setForm({ ...form, monto: '', cuotas_restantes: '', notas: '' });
      onCreado();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <form onSubmit={crear} className="grid md:grid-cols-6 gap-2">
      {!colaboradorId && (
        <select required className="input w-full md:col-span-2" value={form.colaborador_id}
          onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}>
          <option value="">Colaborador…</option>
          {(colaboradores || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
      <select className="input w-full" value={form.tipo_linea}
        onChange={(e) => setForm({ ...form, tipo_linea: e.target.value })}>
        {tipos.map((t) => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
      </select>
      <input required type="number" step="0.01" min="0.01" placeholder="Monto" className="input w-full"
        value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
      <select className="input w-full" value={form.aplicar_en}
        onChange={(e) => setForm({ ...form, aplicar_en: e.target.value })}>
        {Object.entries(QUINCENA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input type="number" min="1" placeholder="Cuotas (opcional)" className="input w-full"
        value={form.cuotas_restantes} onChange={(e) => setForm({ ...form, cuotas_restantes: e.target.value })} />
      <button className="btn btn-primary">Agregar</button>
      <input placeholder="Notas (opcional)" className={`input w-full ${colaboradorId ? 'md:col-span-5' : 'md:col-span-6'}`}
        value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
    </form>
  );
}

export function TablaDescuentos({ descuentos, onCambio, conColaborador = true }) {
  const toast = useToast();
  const confirm = useConfirm();

  const alternar = async (d) => {
    try {
      await api.patch(`/descuentos/${d.id}`, { activo: !d.activo });
      onCambio();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const eliminar = async (d) => {
    const ok = await confirm({
      title: 'Eliminar descuento',
      message: `¿Eliminar ${d.tipo_linea} de ${d.colaborador_nombre ?? 'este colaborador'}?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/descuentos/${d.id}`);
      toast.success('Descuento eliminado.');
      onCambio();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <table className="w-full text-sm">
      <thead className="text-slate-500 text-left">
        <tr className="border-b border-slate-200">
          {conColaborador && <th className="p-3">Colaborador</th>}
          <th className="p-3">Concepto</th>
          <th className="p-3 text-right">Monto</th>
          <th className="p-3">Aplica en</th>
          <th className="p-3 text-right">Cuotas rest.</th>
          <th className="p-3">Estado</th>
          <th className="p-3"></th>
        </tr>
      </thead>
      <tbody>
        {descuentos.map((d) => (
          <tr key={d.id} className={`border-b border-slate-200 hover:bg-slate-50 ${!d.activo && 'opacity-50'}`}>
            {conColaborador && (
              <td className="p-3">
                <Link to={`/colaboradores/${d.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                  {d.colaborador_nombre}
                </Link>
              </td>
            )}
            <td className="p-3">{d.tipo_linea}{d.notas && <span className="text-slate-400"> — {d.notas}</span>}</td>
            <td className="p-3 text-right font-medium">{money(d.monto)}</td>
            <td className="p-3">{QUINCENA_LABEL[d.aplicar_en]}</td>
            <td className="p-3 text-right">{d.cuotas_restantes ?? '∞'}</td>
            <td className="p-3">
              <button onClick={() => alternar(d)}
                className={d.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                {d.activo ? 'ACTIVO' : 'INACTIVO'}
              </button>
            </td>
            <td className="p-3 text-right">
              <button onClick={() => eliminar(d)} className="text-slate-400 hover:text-red-600" title="Eliminar">
                <Trash2 size={15} />
              </button>
            </td>
          </tr>
        ))}
        {descuentos.length === 0 && (
          <tr><td colSpan={7} className="p-4 text-slate-500">Sin descuentos registrados.</td></tr>
        )}
      </tbody>
    </table>
  );
}

export default function Descuentos() {
  const [descuentos, setDescuentos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/descuentos').then(setDescuentos).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  }, []);

  const total = descuentos.filter((d) => d.activo).reduce((s, d) => s + Number(d.monto), 0);

  return (
    <div className="animate-fade-in">
      <PageTitle>Descuentos recurrentes</PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <Card className="mb-4">
        <h2 className="font-semibold mb-1">Nuevo descuento</h2>
        <p className="text-sm text-muted mb-4">
          Se aplica automáticamente al generar cada período, en la quincena elegida. Con cuotas definidas, se desactiva solo al terminar.
        </p>
        <FormDescuento colaboradores={colaboradores} onCreado={() => { setError(null); cargar(); }} onError={setError} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <div className="flex items-center justify-between p-4 pb-0">
          <h2 className="font-semibold">Todos los descuentos</h2>
          <span className="text-sm text-muted">{descuentos.filter((d) => d.activo).length} activos · {money(total)} por período completo</span>
        </div>
        <TablaDescuentos descuentos={descuentos} onCambio={cargar} />
      </Card>
    </div>
  );
}
