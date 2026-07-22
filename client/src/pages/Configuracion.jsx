import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = ['General', 'Empresas', 'Servicios de Descuento', 'Tipos de Contrato', 'Horarios', 'Bancos', 'Usuarios'];

const ETIQUETAS_PARAMETRO = {
  SBU: 'Salario Básico Unificado (SBU)',
  PORCENTAJE_ANTICIPO: 'Porcentaje de anticipo global (1ra quincena, 0 a 1)',
  DIAS_VACACIONES_ANIO: 'Días de vacaciones por año trabajado',
  MINUTOS_GRACIA: 'Minutos de gracia antes de descontar por atraso/salida anticipada',
};

function ParametroFila({ parametro, onGuardar }) {
  const [valor, setValor] = useState(parametro.valor);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onGuardar(parametro.clave, valor); }}
      className="flex items-center gap-2">
      <label className="text-sm text-slate-600 flex-1">
        {ETIQUETAS_PARAMETRO[parametro.clave] || parametro.clave}
      </label>
      <input value={valor} onChange={(e) => setValor(e.target.value)} className="input w-32" />
      <button className="btn btn-primary !px-3 !py-1.5 text-xs">Guardar</button>
    </form>
  );
}

function GeneralTab() {
  const [parametros, setParametros] = useState([]);
  const toast = useToast();

  const cargar = () => api.get('/parametros').then(setParametros).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const guardar = async (clave, valor) => {
    try {
      await api.put(`/parametros/${clave}`, { valor });
      toast.success('Parámetro actualizado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <h2 className="font-display font-bold mb-3">Parámetros generales</h2>
      <div className="grid gap-3 max-w-lg">
        {parametros.map((p) => (
          <ParametroFila key={p.clave} parametro={p} onGuardar={guardar} />
        ))}
        {parametros.length === 0 && <p className="text-sm text-slate-500">Sin parámetros.</p>}
      </div>
    </Card>
  );
}

function EmpresasTab() {
  const [empresas, setEmpresas] = useState([]);
  const toast = useToast();

  const cargar = () => api.get('/empresas').then(setEmpresas).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const alternar = async (e) => {
    try {
      await api.patch(`/empresas/${encodeURIComponent(e.empresa)}`, { aplica_retencion: !e.aplica_retencion });
      toast.success('Configuración actualizada.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Retención de fuente por empresa</h2>
      <p className="text-sm text-muted mb-4">
        Define si las facturas de proveedores de cada empresa aplican el 10% de retención de fuente automáticamente.
      </p>
      <div className="grid gap-2 max-w-lg">
        {empresas.map((e) => (
          <div key={e.empresa} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-slate-700">{e.empresa}</span>
            <button onClick={() => alternar(e)}
              className={e.aplica_retencion ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
              {e.aplica_retencion ? 'RETIENE 10%' : 'NO RETIENE'}
            </button>
          </div>
        ))}
        {empresas.length === 0 && <p className="text-sm text-slate-500">Sin empresas configuradas.</p>}
      </div>
    </Card>
  );
}

function BancosTab() {
  const [bancos, setBancos] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ codigo: '', nombre: '' });
  const [editando, setEditando] = useState(null);
  const toast = useToast();

  const cargar = () => api.get('/bancos/todos').then(setBancos).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/bancos', form);
      setForm({ codigo: '', nombre: '' });
      toast.success('Banco agregado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/bancos/${editando.codigo}`, { nombre: editando.nombre });
      toast.success('Banco actualizado.');
      setEditando(null);
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const alternar = async (b) => {
    try {
      await api.patch(`/bancos/${b.codigo}`, { activo: !b.activo });
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filtrados = bancos.filter(
    (b) => !q || b.nombre.toLowerCase().includes(q.toLowerCase()) || b.codigo.includes(q)
  );

  return (
    <Card>
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
        <table className="hidden md:table w-full text-sm">
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
                  <button onClick={() => setEditando({ codigo: b.codigo, nombre: b.nombre })} className="text-gold-600 text-xs hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin resultados.</td></tr>}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {filtrados.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin resultados.</p>}
          {filtrados.map((b) => (
            <MobileCard
              key={b.codigo}
              className={!b.activo ? 'opacity-50' : ''}
              top={
                <>
                  <span className="font-medium text-slate-800">{b.nombre}</span>
                  <button onClick={() => alternar(b)}
                    className={b.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {b.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </>
              }
              meta={`Código ${b.codigo}`}
              footer={
                <button onClick={() => setEditando({ codigo: b.codigo, nombre: b.nombre })} className="text-gold-600 p-2 -m-2">
                  Editar
                </button>
              }
            />
          ))}
        </div>
      </div>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={`Editar banco — código ${editando?.codigo}`} size="sm"
        footer={<button type="submit" form="form-editar-banco" className="btn btn-primary">Guardar</button>}>
        <form id="form-editar-banco" onSubmit={guardarEdicion}>
          <label className="text-sm text-slate-600">Nombre de la institución
            <input required autoFocus className="input w-full mt-1" value={editando?.nombre ?? ''}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
          </label>
        </form>
      </Modal>
    </Card>
  );
}

function UsuariosTab() {
  const VACIO = { email: '', nombre: '', rol: 'COLABORADOR', colaborador_id: '' };
  const [usuarios, setUsuarios] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const toast = useToast();

  const cargar = () => {
    api.get('/usuarios').then(setUsuarios).catch((e) => toast.error(e.message));
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const guardarUsuario = async (e) => {
    e.preventDefault();
    try {
      await api.post('/usuarios', { ...form, colaborador_id: form.colaborador_id || null });
      setForm(VACIO);
      toast.success('Usuario guardado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
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
          <button className="btn btn-primary md:col-span-4">Guardar usuario</button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="hidden md:table w-full text-sm">
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
                <td className="p-3"><Badge estado={u.activo ? 'PAGADO' : 'PENDIENTE'} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {usuarios.length === 0 && <p className="p-4 text-slate-500 text-sm">Sin usuarios.</p>}
          {usuarios.map((u) => (
            <MobileCard
              key={u.id}
              top={
                <>
                  <span className="font-medium text-slate-800 truncate">{u.email}</span>
                  <Badge estado={u.activo ? 'PAGADO' : 'PENDIENTE'} />
                </>
              }
              meta={`Rol: ${u.rol}`}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function ServiciosDescuentoTab() {
  const [servicios, setServicios] = useState([]);
  const [form, setForm] = useState({ codigo: '', nombre: '' });
  const [editando, setEditando] = useState(null);
  const toast = useToast();

  const cargar = () => api.get('/servicios-descuento').then(setServicios).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/servicios-descuento', form);
      setForm({ codigo: '', nombre: '' });
      toast.success('Servicio agregado.');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/servicios-descuento/${editando.codigo}`, { nombre: editando.nombre });
      toast.success('Servicio actualizado.');
      setEditando(null);
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const alternar = async (s) => {
    try {
      await api.patch(`/servicios-descuento/${s.codigo}`, { activo: !s.activo });
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Servicios de descuento</h2>
      <p className="text-sm text-muted mb-3">
        Catálogo de conceptos disponibles para aplicar como descuento recurrente a los colaboradores.
        Los inactivos no aparecen en los selects al crear descuentos.
      </p>

      <form onSubmit={crear} className="grid md:grid-cols-4 gap-2 mb-3">
        <input required placeholder="Código (ej. SEGURO_VIDA)" className="input w-full font-mono text-sm" value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        <input required placeholder="Nombre del servicio" className="input w-full md:col-span-2" value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <button className="btn btn-primary">Agregar servicio</button>
      </form>

      <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left sticky top-0 bg-white">
            <tr className="border-b border-slate-200">
              <th className="p-2">Código</th>
              <th className="p-2">Nombre</th>
              <th className="p-2 w-28">Estado</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) => (
              <tr key={s.codigo} className={`border-b border-slate-100 ${!s.activo && 'opacity-50'}`}>
                <td className="p-2 font-mono text-xs">{s.codigo}</td>
                <td className="p-2">{s.nombre}</td>
                <td className="p-2">
                  <button onClick={() => alternar(s)}
                    className={s.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {s.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </td>
                <td className="p-2">
                  <button onClick={() => setEditando({ codigo: s.codigo, nombre: s.nombre })} className="text-gold-600 text-xs hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {servicios.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin servicios.</td></tr>}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {servicios.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin servicios.</p>}
          {servicios.map((s) => (
            <MobileCard
              key={s.codigo}
              className={!s.activo ? 'opacity-50' : ''}
              top={
                <>
                  <span className="font-medium text-slate-800">{s.nombre}</span>
                  <button onClick={() => alternar(s)}
                    className={s.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {s.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </>
              }
              meta={`Código ${s.codigo}`}
              footer={
                <button onClick={() => setEditando({ codigo: s.codigo, nombre: s.nombre })} className="text-gold-600 p-2 -m-2">
                  Editar
                </button>
              }
            />
          ))}
        </div>
      </div>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={`Editar servicio — ${editando?.codigo}`} size="sm"
        footer={<button type="submit" form="form-editar-servicio" className="btn btn-primary">Guardar</button>}>
        <form id="form-editar-servicio" onSubmit={guardarEdicion}>
          <label className="text-sm text-slate-600">Nombre del servicio
            <input required autoFocus className="input w-full mt-1" value={editando?.nombre ?? ''}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
          </label>
        </form>
      </Modal>
    </Card>
  );
}

function TiposContratoTab() {
  const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({ codigo: '', nombre: '' });
  const [editando, setEditando] = useState(null);
  const toast = useToast();

  const cargar = () => api.get('/tipos-contrato/todos').then(setTipos).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tipos-contrato', form);
      setForm({ codigo: '', nombre: '' });
      toast.success('Tipo de contrato agregado.');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/tipos-contrato/${editando.codigo}`, { nombre: editando.nombre });
      toast.success('Tipo de contrato actualizado.');
      setEditando(null);
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const alternar = async (t) => {
    try {
      await api.patch(`/tipos-contrato/${t.codigo}`, { activo: !t.activo });
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Tipos de contrato</h2>
      <p className="text-sm text-muted mb-3">
        Catálogo de tipos de contrato disponibles en el historial de contratos del colaborador.
        Los inactivos no aparecen en el select al registrar un contrato nuevo.
      </p>

      <form onSubmit={crear} className="grid md:grid-cols-4 gap-2 mb-3">
        <input required placeholder="Código (ej. PRACTICAS)" className="input w-full font-mono text-sm" value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        <input required placeholder="Nombre del tipo de contrato" className="input w-full md:col-span-2" value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <button className="btn btn-primary">Agregar tipo</button>
      </form>

      <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left sticky top-0 bg-white">
            <tr className="border-b border-slate-200">
              <th className="p-2">Código</th>
              <th className="p-2">Nombre</th>
              <th className="p-2 w-28">Estado</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.codigo} className={`border-b border-slate-100 ${!t.activo && 'opacity-50'}`}>
                <td className="p-2 font-mono text-xs">{t.codigo}</td>
                <td className="p-2">{t.nombre}</td>
                <td className="p-2">
                  <button onClick={() => alternar(t)}
                    className={t.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {t.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </td>
                <td className="p-2">
                  <button onClick={() => setEditando({ codigo: t.codigo, nombre: t.nombre })} className="text-gold-600 text-xs hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {tipos.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin tipos de contrato.</td></tr>}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {tipos.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin tipos de contrato.</p>}
          {tipos.map((t) => (
            <MobileCard
              key={t.codigo}
              className={!t.activo ? 'opacity-50' : ''}
              top={
                <>
                  <span className="font-medium text-slate-800">{t.nombre}</span>
                  <button onClick={() => alternar(t)}
                    className={t.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {t.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </>
              }
              meta={`Código ${t.codigo}`}
              footer={
                <button onClick={() => setEditando({ codigo: t.codigo, nombre: t.nombre })} className="text-gold-600 p-2 -m-2">
                  Editar
                </button>
              }
            />
          ))}
        </div>
      </div>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={`Editar tipo — ${editando?.codigo}`} size="sm"
        footer={<button type="submit" form="form-editar-tipo-contrato" className="btn btn-primary">Guardar</button>}>
        <form id="form-editar-tipo-contrato" onSubmit={guardarEdicion}>
          <label className="text-sm text-slate-600">Nombre del tipo de contrato
            <input required autoFocus className="input w-full mt-1" value={editando?.nombre ?? ''}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
          </label>
        </form>
      </Modal>
    </Card>
  );
}

function HorarioEditModal({ horario, onClose, onGuardado }) {
  const [form, setForm] = useState({ ...horario });
  const toast = useToast();

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/horarios/${horario.codigo}`, {
        nombre: form.nombre,
        hora_entrada_semana: form.hora_entrada_semana,
        hora_salida_semana: form.hora_salida_semana,
        hora_entrada_sabado: form.hora_entrada_sabado,
        hora_salida_sabado: form.hora_salida_sabado,
        horas_jornada_semana: Number(form.horas_jornada_semana),
        horas_jornada_sabado: Number(form.horas_jornada_sabado),
      });
      toast.success('Horario actualizado.');
      onGuardado();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Editar horario — ${horario.codigo}`} size="md"
      footer={<button type="submit" form="form-editar-horario" className="btn btn-primary">Guardar</button>}>
      <form id="form-editar-horario" onSubmit={guardar} className="grid gap-3">
        <label className="text-sm text-slate-600">Nombre
          <input required className="input w-full" value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-600">Entrada (lunes a viernes)
            <input required type="time" className="input w-full" value={form.hora_entrada_semana}
              onChange={(e) => setForm({ ...form, hora_entrada_semana: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Salida (lunes a viernes)
            <input required type="time" className="input w-full" value={form.hora_salida_semana}
              onChange={(e) => setForm({ ...form, hora_salida_semana: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Entrada (sábado)
            <input required type="time" className="input w-full" value={form.hora_entrada_sabado}
              onChange={(e) => setForm({ ...form, hora_entrada_sabado: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Salida (sábado)
            <input required type="time" className="input w-full" value={form.hora_salida_sabado}
              onChange={(e) => setForm({ ...form, hora_salida_sabado: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Horas de jornada (semana)
            <input required type="number" step="0.5" min="0" className="input w-full" value={form.horas_jornada_semana}
              onChange={(e) => setForm({ ...form, horas_jornada_semana: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Horas de jornada (sábado)
            <input required type="number" step="0.5" min="0" className="input w-full" value={form.horas_jornada_sabado}
              onChange={(e) => setForm({ ...form, horas_jornada_sabado: e.target.value })} />
          </label>
        </div>
      </form>
    </Modal>
  );
}

function HorariosTab() {
  const [horarios, setHorarios] = useState([]);
  const [editando, setEditando] = useState(null);
  const toast = useToast();

  const cargar = () => api.get('/horarios/todos').then(setHorarios).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Horarios</h2>
      <p className="text-sm text-muted mb-3">
        Usados para calcular descuentos por atraso o salida anticipada en la pestaña
        "Horario" de la ficha del colaborador.
      </p>
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Horario</th>
              <th className="p-2">Lunes a viernes</th>
              <th className="p-2">Sábado</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {horarios.map((h) => (
              <tr key={h.codigo} className="border-b border-slate-100">
                <td className="p-2 font-medium">{h.nombre}</td>
                <td className="p-2">
                  {h.hora_entrada_semana.slice(0, 5)} - {h.hora_salida_semana.slice(0, 5)} ({h.horas_jornada_semana}h)
                </td>
                <td className="p-2">
                  {h.hora_entrada_sabado.slice(0, 5)} - {h.hora_salida_sabado.slice(0, 5)} ({h.horas_jornada_sabado}h)
                </td>
                <td className="p-2">
                  <button onClick={() => setEditando(h)} className="text-gold-600 text-xs hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {horarios.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin horarios.</td></tr>}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {horarios.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin horarios.</p>}
          {horarios.map((h) => (
            <MobileCard
              key={h.codigo}
              top={<span className="font-medium text-slate-800">{h.nombre}</span>}
              meta={`L-V ${h.hora_entrada_semana.slice(0, 5)}-${h.hora_salida_semana.slice(0, 5)} (${h.horas_jornada_semana}h) · Sáb ${h.hora_entrada_sabado.slice(0, 5)}-${h.hora_salida_sabado.slice(0, 5)} (${h.horas_jornada_sabado}h)`}
              footer={<button onClick={() => setEditando(h)} className="text-gold-600 p-2 -m-2">Editar</button>}
            />
          ))}
        </div>
      </div>
      {editando && (
        <HorarioEditModal horario={editando} onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); }} />
      )}
    </Card>
  );
}

export default function Configuracion() {
  const [tab, setTab] = useState('General');
  return (
    <div className="animate-fade-in">
      <PageTitle>Configuración</PageTitle>
      <select value={tab} onChange={(e) => setTab(e.target.value)} className="input w-full mb-4 md:hidden">
        {TABS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <div className="hidden md:flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-white border border-b-0 border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'General' && <GeneralTab />}
      {tab === 'Empresas' && <EmpresasTab />}
      {tab === 'Servicios de Descuento' && <ServiciosDescuentoTab />}
      {tab === 'Tipos de Contrato' && <TiposContratoTab />}
      {tab === 'Horarios' && <HorariosTab />}
      {tab === 'Bancos' && <BancosTab />}
      {tab === 'Usuarios' && <UsuariosTab />}
    </div>
  );
}
