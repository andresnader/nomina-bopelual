import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money } from '../utils.js';

const VACIO = { email: '', nombre: '', rol: 'COLABORADOR', colaborador_id: '' };

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
    api.get('/colaboradores?activo=true').then(setColaboradores).catch(() => {});
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
      {error && <Card className="mb-4 text-red-300">{error}</Card>}
      {msg && <Card className="mb-4 text-green-300">{msg}</Card>}

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-3">Salario Básico Unificado (SBU)</h2>
        <form onSubmit={guardarSbu} className="flex gap-2 items-center">
          <span className="text-slate-400 text-sm">Actual: {money(sbu)}</span>
          <input value={sbu} onChange={(e) => setSbu(e.target.value)}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm w-32" />
          <button className="bg-brand-yellow text-brand-darker font-semibold px-4 py-2 rounded-lg text-sm">
            Guardar
          </button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-3">Nuevo usuario / rol</h2>
        <form onSubmit={guardarUsuario} className="grid md:grid-cols-4 gap-2">
          <input required type="email" placeholder="correo@bopelual.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
          <input placeholder="Nombre" value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm">
            {['ADMIN', 'RRHH', 'COLABORADOR', 'GERENCIA'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
            className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm">
            <option value="">Sin vincular</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <button className="bg-brand-yellow text-brand-darker font-semibold px-4 py-2 rounded-lg text-sm md:col-span-4">
            Guardar usuario
          </button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr className="border-b border-white/5">
              <th className="p-3">Correo</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Activo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-white/5">
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
