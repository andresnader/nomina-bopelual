import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money } from '../utils.js';

const VACIO = { email: '', nombre: '', rol: 'COLABORADOR', colaborador_id: '' };

// Catálogo de instituciones financieras para el TXT Cash Management Pichincha.
function ConfiguracionBancos({ onError }) {
  const [bancos, setBancos] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ codigo: '', nombre: '' });

  const cargar = () => api.get('/bancos/todos').then(setBancos).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/bancos', form);
      setForm({ codigo: '', nombre: '' });
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const renombrar = async (b) => {
    const nombre = prompt(`Nuevo nombre para el código ${b.codigo}`, b.nombre);
    if (!nombre || nombre === b.nombre) return;
    try { await api.patch(`/bancos/${b.codigo}`, { nombre }); cargar(); }
    catch (err) { onError(err.message); }
  };

  const alternar = async (b) => {
    try { await api.patch(`/bancos/${b.codigo}`, { activo: !b.activo }); cargar(); }
    catch (err) { onError(err.message); }
  };

  const filtrados = bancos.filter(
    (b) => !q || b.nombre.toLowerCase().includes(q.toLowerCase()) || b.codigo.includes(q)
  );

  return (
    <Card className="mb-4">
      <h2 className="font-display font-bold mb-1">Configuración de bancos</h2>
      <p className="text-sm text-muted mb-3">
        Códigos de instituciones financieras para el archivo de pago masivo (catálogo Cash Management Pichincha, {bancos.length} instituciones).
        Los inactivos no aparecen al asignar banco en la ficha del colaborador.
      </p>

      <form onSubmit={crear} className="grid md:grid-cols-4 gap-2 mb-3">
        <input required placeholder="Código (ej. 10)" className="input w-full" value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        <input required placeholder="Nombre de la institución" className="input w-full md:col-span-2" value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <button className="btn btn-primary">Agregar banco</button>
      </form>

      <input placeholder="Buscar por nombre o código…" className="input w-full mb-2"
        value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left sticky top-0 bg-white">
            <tr className="border-b border-slate-200">
              <th className="p-2 w-20">Código</th>
              <th className="p-2">Institución</th>
              <th className="p-2 w-28">Estado</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((b) => (
              <tr key={b.codigo} className={`border-b border-slate-100 ${!b.activo && 'opacity-50'}`}>
                <td className="p-2 font-mono">{b.codigo}</td>
                <td className="p-2">{b.nombre}</td>
                <td className="p-2">
                  <button onClick={() => alternar(b)}
                    className={b.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {b.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </td>
                <td className="p-2">
                  <button onClick={() => renombrar(b)} className="text-gold-600 text-xs hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Configuracion() {
  const [usuarios, setUsuarios] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [sbu, setSbu] = useState('');
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const cargar = () => {
    api.get('/usuarios').then(setUsuarios).catch((e) => setError(e.message));
    api.get('/parametros').then((p) => setSbu(p.find((x) => x.clave === 'SBU')?.valor || '')).catch(() => {});
    api.get('/colaboradores?activo=true').then((r) => setColaboradores(r.data || r)).catch(() => {});
  };
  useEffect(() => {
    cargar();
  }, []);

  const guardarUsuario = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/usuarios', { ...form, colaborador_id: form.colaborador_id || null });
      setForm(VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const guardarSbu = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.put('/parametros/SBU', { valor: sbu });
      setMsg('SBU actualizado.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageTitle>Configuración</PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}
      {msg && <Card className="mb-4 text-emerald-600">{msg}</Card>}

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-3">Salario Básico Unificado (SBU)</h2>
        <form onSubmit={guardarSbu} className="flex gap-2 items-center">
          <span className="text-slate-500 text-sm">Actual: {money(sbu)}</span>
          <input value={sbu} onChange={(e) => setSbu(e.target.value)}
            className="input w-32" />
          <button className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm">
            Guardar
          </button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-3">Nuevo usuario / rol</h2>
        <form onSubmit={guardarUsuario} className="grid md:grid-cols-4 gap-2">
          <input required type="email" placeholder="correo@bopelual.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input w-full" />
          <input placeholder="Nombre" value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="input w-full" />
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="input w-full">
            {['ADMIN', 'RRHH', 'COLABORADOR', 'GERENCIA'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
            className="input w-full">
            <option value="">Sin vincular</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <button className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm md:col-span-4">
            Guardar usuario
          </button>
        </form>
      </Card>

      <ConfiguracionBancos onError={setError} />

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Correo</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Activo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-200">
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.rol}</td>
                <td className="p-3">
                  <Badge estado={u.activo ? 'PAGADO' : 'PENDIENTE'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
