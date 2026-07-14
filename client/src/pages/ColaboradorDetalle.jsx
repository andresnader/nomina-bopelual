import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Pencil, Star, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money, fecha } from '../utils.js';
import { FormDescuento, TablaDescuentos } from './Descuentos.jsx';
import { AbonoModal, CuotaModal } from './Prestamos.jsx';
import { FormAusencia, TablaAusencias } from './Ausencias.jsx';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { FormFactura, TablaFacturas } from './Proveedores.jsx';

const TABS_BASE = ['Ficha', 'Horario', 'Contratos', 'Ingresos', 'Descuentos', 'Préstamos', 'Anticipos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];

function FichaTab({ col, onGuardado, onError }) {
  const [bancos, setBancos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  useEffect(() => {
    api.get('/bancos').then(setBancos).catch(() => {});
    api.get('/horarios').then(setHorarios).catch(() => {});
  }, []);
  const [form, setForm] = useState({
    nombre: col.nombre ?? '', email: col.email ?? '', cedula: col.cedula ?? '',
    departamento: col.departamento ?? '', cargo: col.cargo ?? '', fecha_ingreso: col.fecha_ingreso?.slice(0, 10) ?? '',
    empresa: col.empresa ?? '', centro_costo: col.centro_costo ?? '', cargas_personales: col.cargas_personales ?? 0,
    banco: col.banco ?? '', codigo_banco: col.codigo_banco ?? '', tipo_cuenta: col.tipo_cuenta ?? 'AHORRO',
    cuenta_bancaria: col.cuenta_bancaria ?? '', forma_pago: col.forma_pago ?? 'TRANSFERENCIA',
    pct_anticipo: col.pct_anticipo ?? '',
    fecha_nacimiento: col.fecha_nacimiento?.slice(0, 10) ?? '', sexo: col.sexo ?? '',
    estado_civil: col.estado_civil ?? '', direccion: col.direccion ?? '',
    horario: col.horario ?? '',
    acumular_decimos: col.acumular_decimos ?? true,
    acumular_fondos_reserva: col.acumular_fondos_reserva ?? false,
    extension_conyugal: col.extension_conyugal ?? false,
  });

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/colaboradores/${col.id}`, {
        ...form,
        fecha_ingreso: form.fecha_ingreso || null,
        cargas_personales: Number(form.cargas_personales) || 0,
        pct_anticipo: form.pct_anticipo === '' ? null : Number(form.pct_anticipo),
        fecha_nacimiento: form.fecha_nacimiento || null,
        sexo: form.sexo || null,
        estado_civil: form.estado_civil || null,
        direccion: form.direccion || null,
        horario: form.horario || null,
      });
      onGuardado();
    } catch (err) {
      onError(err.message);
    }
  };

  const campo = (k, props = {}) => (
    <input className="input w-full" value={form[k]} {...props}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );

  return (
    <form onSubmit={guardar} className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Datos personales y laborales</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm text-slate-600">Nombre {campo('nombre', { required: true })}</label>
          <label className="text-sm text-slate-600">Cédula / RUC {campo('cedula')}</label>
          <label className="text-sm text-slate-600">Email {campo('email', { type: 'email' })}</label>
          <label className="text-sm text-slate-600">Departamento {campo('departamento')}</label>
          <label className="text-sm text-slate-600">Cargo {campo('cargo')}</label>
          <label className="text-sm text-slate-600">Fecha de nacimiento {campo('fecha_nacimiento', { type: 'date' })}</label>
          <label className="text-sm text-slate-600">Sexo
            <select className="input w-full" value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })}>
              <option value="">—</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Estado civil
            <select className="input w-full" value={form.estado_civil} onChange={(e) => setForm({ ...form, estado_civil: e.target.value })}>
              <option value="">—</option>
              <option value="SOLTERO">Soltero/a</option>
              <option value="CASADO">Casado/a</option>
              <option value="DIVORCIADO">Divorciado/a</option>
              <option value="VIUDO">Viudo/a</option>
              <option value="UNION_LIBRE">Unión libre</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Dirección de domicilio {campo('direccion')}</label>
          <label className="text-sm text-slate-600">Fecha de ingreso (IESS) {campo('fecha_ingreso', { type: 'date' })}</label>
          <label className="text-sm text-slate-600">Empresa
            <select className="input w-full" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })}>
              <option value="">—</option>
              <option>BOPELUAL S.A.</option>
              <option>CARROS-YA S.A.</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Horario
            <select className="input w-full" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })}>
              <option value="">—</option>
              {horarios.map((h) => <option key={h.codigo} value={h.codigo}>{h.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">Centro de costo {campo('centro_costo')}</label>
          <label className="text-sm text-slate-600">Cargas personales {campo('cargas_personales', { type: 'number', min: 0 })}</label>
          <label className="text-sm text-slate-600">Anticipo 1ra quincena
            <select className="input w-full" value={form.pct_anticipo}
              onChange={(e) => setForm({ ...form, pct_anticipo: e.target.value })}>
              <option value="">Global (parámetro, 40%)</option>
              <option value="0.4">40% / 60%</option>
              <option value="0.5">50% / 50%</option>
              <option value="0.6">60% / 40%</option>
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Configuración laboral</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
              checked={form.acumular_decimos}
              onChange={(e) => setForm({ ...form, acumular_decimos: e.target.checked })} />
            Acumular décimos (provisión mensual)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
              checked={form.acumular_fondos_reserva}
              onChange={(e) => setForm({ ...form, acumular_fondos_reserva: e.target.checked })} />
            Acumular fondos de reserva desde el Año
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
              checked={form.extension_conyugal}
              onChange={(e) => setForm({ ...form, extension_conyugal: e.target.checked })} />
            Extensión conyugal (10% adicional IESS)
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">Datos bancarios</h2>
        <p className="text-sm text-muted mb-3">Necesarios para incluirlo en el TXT de pago masivo del banco.</p>
        <div className="grid md:grid-cols-4 gap-3">
          <label className="text-sm text-slate-600">Banco (catálogo Pichincha)
            <select className="input w-full" value={form.codigo_banco}
              onChange={(e) => {
                const b = bancos.find((x) => x.codigo === e.target.value);
                setForm({ ...form, codigo_banco: e.target.value, banco: b?.nombre ?? '' });
              }}>
              <option value="">—</option>
              {bancos.map((b) => <option key={b.codigo} value={b.codigo}>{b.codigo} — {b.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">Tipo de cuenta
            <select className="input w-full" value={form.tipo_cuenta} onChange={(e) => setForm({ ...form, tipo_cuenta: e.target.value })}>
              <option>AHORRO</option>
              <option>CORRIENTE</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">N° de cuenta {campo('cuenta_bancaria')}</label>
        </div>
      </Card>

      <div>
        <button className="btn btn-primary">Guardar ficha</button>
      </div>
    </form>
  );
}

function EmitirContratoModal({ contrato, colaboradorId, onClose, onEmitido, onError }) {
  const tipo = contrato.tipo_contrato;

  const configs = {
    PRODUCTIVO: {
      title: 'Emitir contrato productivo',
      endpoint: `/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones`,
      fields: [
        { key: 'funciones', label: 'Funciones del cargo (una por línea)', type: 'textarea', required: true },
        { key: 'remuneracion_letras', label: 'Remuneración en letras (ej. SEISCIENTOS 00/100)', type: 'text', required: true },
        { key: 'horas_semanales', label: 'Horas semanales (ej. cuarenta)', type: 'text', required: true, col: 'md:col-span-1' },
        { key: 'horas_diarias', label: 'Horas diarias (ej. Ocho)', type: 'text', required: true, col: 'md:col-span-1' },
        { key: 'dias_descanso', label: 'Días de descanso (ej. Dos)', type: 'text', required: true, col: 'md:col-span-1' },
        { key: 'duracion_texto', label: 'Duración del contrato', type: 'text', required: true },
        { key: 'periodo_prueba_texto', label: 'Período de prueba', type: 'text', required: true },
      ],
    },
    COMISIONISTA: {
      title: 'Emitir contrato comisionista',
      endpoint: `/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones-avanzadas`,
      fields: [
        { key: 'comision_porcentaje', label: 'Porcentaje de comisión', type: 'text', required: true },
        { key: 'anexo_productos', label: 'Anexo N°1 — Productos a comercializar', type: 'textarea', required: true },
        { key: 'anexo_precios', label: 'Anexo N°2 — Precios mínimos de venta', type: 'textarea', required: true },
      ],
      extraBody: { tipo_documento: 'COMISIONISTA' },
    },
    SERVICIOS_PROFESIONALES: {
      title: 'Emitir contrato servicios profesionales',
      endpoint: `/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones-avanzadas`,
      fields: [
        { key: 'honorarios_letras', label: 'Honorarios en letras (ej. NOVECIENTOS DÓLARES)', type: 'text', required: true },
        { key: 'honorarios_numero', label: 'Honorarios mensuales en USD', type: 'number', required: true },
        { key: 'plazo_meses', label: 'Plazo en meses', type: 'number', required: true },
        { key: 'honorarios_mes12_letras', label: 'Honorarios mes 12 en letras (opcional)', type: 'text', required: false },
        { key: 'honorarios_mes12_numero', label: 'Honorarios mes 12 en USD (opcional)', type: 'number', required: false },
      ],
      extraBody: { tipo_documento: 'SERVICIOS_PROFESIONALES' },
    },
  };

  const config = configs[tipo] || configs.PRODUCTIVO;
  const initial = Object.fromEntries(config.fields.map(f => [f.key, '']));
  const [form, setForm] = useState(initial);
  const [enviando, setEnviando] = useState(false);

  const emitir = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const body = { ...form, ...(config.extraBody || {}) };
      await api.post(config.endpoint, body);
      onEmitido();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={config.title} size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button form="form-emitir-contrato" disabled={enviando} className="btn btn-primary">
            {enviando ? 'Generando…' : 'Generar y descargar'}
          </button>
        </>
      }>
      <form id="form-emitir-contrato" onSubmit={emitir} className="grid gap-3">
        <div className="grid md:grid-cols-3 gap-3">
          {config.fields.map(f => {
            const input = f.type === 'textarea' ? (
              <textarea required={f.required} rows={4} className="input w-full"
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input type={f.type || 'text'} required={f.required} className="input w-full"
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            );
            if (f.col) {
              return <div key={f.key} className={f.col}><label className="text-sm text-slate-600">{f.label}{input}</label></div>;
            }
            return <div key={f.key} className="md:col-span-3"><label className="text-sm text-slate-600">{f.label}{input}</label></div>;
          })}
        </div>
      </form>
    </Modal>
  );
}

const TIPOS_EMITIBLES = ['PRODUCTIVO', 'COMISIONISTA', 'SERVICIOS_PROFESIONALES'];

function EmisionCell({ contrato, colaboradorId, onCambio, onError }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  if (!TIPOS_EMITIBLES.includes(contrato.tipo_contrato)) {
    return <span className="text-slate-400 text-xs" title="Plantilla no disponible aún">—</span>;
  }

  // Debe coincidir exactamente con CONFIG[...].tabla en contrato-emisiones-avanzadas.js
  const TABLA_EMISION = {
    PRODUCTIVO: 'contrato_emisiones',
    COMISIONISTA: 'contrato_comisionista_emisiones',
    SERVICIOS_PROFESIONALES: 'contrato_servicios_profesionales_emisiones',
  };
  const tablaEmision = (t) => TABLA_EMISION[t];

  const subirFirmado = async (emisionId, e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return onError('El archivo supera los 5 MB');
    const base = `/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones`;
    const url = contrato.tipo_contrato === 'PRODUCTIVO'
      ? `${base}/${emisionId}/firmado`
      : `${base}-avanzadas/${tablaEmision(contrato.tipo_contrato)}/${emisionId}/firmado`;
    const res = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
      body: archivo,
    });
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    e.target.value = '';
    onCambio();
  };

  const ultima = contrato.emisiones?.[0];
  const generadoUrl = (id) => contrato.tipo_contrato === 'PRODUCTIVO'
    ? `/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones/${id}/generado`
    : `/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones-avanzadas/${tablaEmision(contrato.tipo_contrato)}/${id}/generado`;
  const firmadoUrl = (id) => contrato.tipo_contrato === 'PRODUCTIVO'
    ? `/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones/${id}/firmado`
    : `/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones-avanzadas/${tablaEmision(contrato.tipo_contrato)}/${id}/firmado`;

  return (
    <div className="flex flex-col items-start gap-1">
      {ultima && (
        <a href={generadoUrl(ultima.id)}
          className="text-xs text-gold-600 hover:underline flex items-center gap-1">
          <Download size={12} /> Generado
        </a>
      )}
      {ultima && (
        ultima.archivo_firmado_key ? (
          <a href={firmadoUrl(ultima.id)}
            className="text-xs text-emerald-700 hover:underline flex items-center gap-1">
            <Download size={12} /> Firmado
          </a>
        ) : (
          <label className="text-xs text-slate-500 cursor-pointer hover:text-gold-600">
            Subir firmado
            <input type="file" className="hidden" onChange={(e) => subirFirmado(ultima.id, e)} />
          </label>
        )
      )}
      <button type="button" onClick={() => setModalAbierto(true)} className="text-xs text-slate-500 hover:text-gold-600">
        {ultima ? 'Reemitir' : 'Emitir contrato'}
      </button>
      {modalAbierto && (
        <EmitirContratoModal
          contrato={contrato}
          colaboradorId={colaboradorId}
          onClose={() => setModalAbierto(false)}
          onEmitido={() => { setModalAbierto(false); onCambio(); }}
          onError={onError}
        />
      )}
    </div>
  );
}

function ContratosTab({ col, onCambio, onError }) {
  const [contrato, setContrato] = useState({ sueldo_base: '', fecha_inicio: '', notas: '', tipo_contrato: '', bono: '' });
  const [tiposContrato, setTiposContrato] = useState([]);
  useEffect(() => {
    api.get('/tipos-contrato').then(setTiposContrato).catch(() => {});
  }, []);

  const nuevoContrato = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/contratos`, {
        ...contrato,
        tipo_contrato: contrato.tipo_contrato || null,
        bono: contrato.bono ? Number(contrato.bono) : 0,
      });
      setContrato({ sueldo_base: '', fecha_inicio: '', notas: '', tipo_contrato: '', bono: '' });
      onCambio();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nuevo contrato / aumento</h2>
        <form onSubmit={nuevoContrato} className="grid md:grid-cols-6 gap-2">
          <input required type="number" step="0.01" placeholder="Sueldo base" className="input w-full"
            value={contrato.sueldo_base} onChange={(e) => setContrato({ ...contrato, sueldo_base: e.target.value })} />
          <input type="number" step="0.01" placeholder="Bono mensual" className="input w-full"
            value={contrato.bono} onChange={(e) => setContrato({ ...contrato, bono: e.target.value })} />
          <input required type="date" className="input w-full"
            value={contrato.fecha_inicio} onChange={(e) => setContrato({ ...contrato, fecha_inicio: e.target.value })} />
          <select className="input w-full" value={contrato.tipo_contrato}
            onChange={(e) => setContrato({ ...contrato, tipo_contrato: e.target.value })}>
            <option value="">Tipo de contrato —</option>
            {tiposContrato.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
          </select>
          <input placeholder="Notas (motivo)" className="input w-full"
            value={contrato.notas} onChange={(e) => setContrato({ ...contrato, notas: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
        </form>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Sueldo</th><th className="p-3">Bono</th><th className="p-3">Desde</th><th className="p-3">Hasta</th><th className="p-3">Tipo</th><th className="p-3">Notas</th><th className="p-3">Emisión</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {col.contratos.map((c) => (
              <tr key={c.id} className="border-b border-slate-200">
                <td className="p-3 font-medium">{money(c.sueldo_base)}</td>
                <td className="p-3">{c.bono ? money(c.bono) : '—'}</td>
                <td className="p-3">{fecha(c.fecha_inicio)}</td>
                <td className="p-3">{c.fecha_fin ? fecha(c.fecha_fin) : <span className="badge bg-emerald-100 text-emerald-700">VIGENTE</span>}</td>
                <td className="p-3">{tiposContrato.find((t) => t.codigo === c.tipo_contrato)?.nombre ?? c.tipo_contrato ?? '—'}</td>
                <td className="p-3 text-slate-500">{c.notas || '—'}</td>
                <td className="p-3">
                  <EmisionCell contrato={c} colaboradorId={col.id} onCambio={onCambio} onError={onError} />
                </td>
                <td className="p-3">
                  <button
                    className="text-red-500 hover:text-red-700 text-xs"
                    title="Eliminar contrato"
                    onClick={async () => {
                      if (!confirm('¿Eliminar este contrato?')) return;
                      try {
                        await api.del(`/colaboradores/${col.id}/contratos/${c.id}`);
                        onCambio();
                      } catch (err) {
                        onError(err.message);
                      }
                    }}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const RUBROS_TIPO = [
  { value: 'SUELDO', label: 'Sueldo' },
  { value: 'ALIMENTACION', label: 'Alimentación' },
  { value: 'TRANSPORTE', label: 'Transporte' },
  { value: 'VIVIENDA', label: 'Vivienda' },
  { value: 'COMISIONES', label: 'Comisiones' },
  { value: 'HORAS_EXTRA', label: 'Horas extra' },
  { value: 'BONO', label: 'Bono' },
  { value: 'OTROS', label: 'Otros' },
];

function RubrosIngresosTab({ col, onError }) {
  const [rubros, setRubros] = useState([]);
  const [form, setForm] = useState({ tipo: 'SUELDO', valor_mensual: '', descripcion: '', deducible: true, afecta_aportacion: true });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const cargar = () => api.get(`/colaboradores/${col.id}/rubros-ingreso`).then(setRubros).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const crear = async (e) => {
    e.preventDefault();
    if (!form.valor_mensual) return onError('El valor mensual es requerido');
    try {
      await api.post(`/colaboradores/${col.id}/rubros-ingreso`, {
        ...form,
        valor_mensual: Number(form.valor_mensual),
      });
      setForm({ tipo: 'SUELDO', valor_mensual: '', descripcion: '', deducible: true, afecta_aportacion: true });
      cargar();
    } catch (e) { onError(e.message); }
  };

  const guardarEdit = async (rubroId) => {
    try {
      await api.patch(`/colaboradores/${col.id}/rubros-ingreso/${rubroId}`, {
        ...editForm,
        valor_mensual: editForm.valor_mensual != null ? Number(editForm.valor_mensual) : undefined,
      });
      setEditId(null);
      cargar();
    } catch (e) { onError(e.message); }
  };

  const eliminar = async (rubroId) => {
    if (!window.confirm('¿Eliminar este rubro de ingreso?')) return;
    try {
      await api.del(`/colaboradores/${col.id}/rubros-ingreso/${rubroId}`);
      cargar();
    } catch (e) { onError(e.message); }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nuevo rubro de ingreso proyectado</h2>
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-3 items-end">
          <label className="text-sm text-slate-600">Tipo
            <select className="input w-full" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {RUBROS_TIPO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">Valor mensual ($)
            <input className="input w-full" type="number" min="0" step="0.01" value={form.valor_mensual}
              onChange={(e) => setForm({ ...form, valor_mensual: e.target.value })} required />
          </label>
          <label className="text-sm text-slate-600">Descripción
            <input className="input w-full" value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Opcional" />
          </label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.deducible}
                onChange={(e) => setForm({ ...form, deducible: e.target.checked })} />
              Deducible
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.afecta_aportacion}
                onChange={(e) => setForm({ ...form, afecta_aportacion: e.target.checked })} />
              Afecta aportación
            </label>
          </div>
          <button className="btn-primary" type="submit">Agregar</button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="p-3 font-medium">Tipo</th>
              <th className="p-3 font-medium">Valor mensual</th>
              <th className="p-3 font-medium">Deducible</th>
              <th className="p-3 font-medium">Afecta aport.</th>
              <th className="p-3 font-medium">Descripción</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rubros.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-slate-400">No hay rubros registrados</td></tr>
            )}
            {rubros.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                {editId === r.id ? (
                  <>
                    <td className="p-2">
                      <select className="input w-full" value={editForm.tipo ?? r.tipo}
                        onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}>
                        {RUBROS_TIPO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <input className="input w-full" type="number" min="0" step="0.01"
                        value={editForm.valor_mensual ?? r.valor_mensual}
                        onChange={(e) => setEditForm({ ...editForm, valor_mensual: e.target.value })} />
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                        checked={editForm.deducible ?? r.deducible}
                        onChange={(e) => setEditForm({ ...editForm, deducible: e.target.checked })} />
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                        checked={editForm.afecta_aportacion ?? r.afecta_aportacion}
                        onChange={(e) => setEditForm({ ...editForm, afecta_aportacion: e.target.checked })} />
                    </td>
                    <td className="p-2">
                      <input className="input w-full" value={editForm.descripcion ?? r.descripcion ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} />
                    </td>
                    <td className="p-2 flex gap-1">
                      <button className="text-xs text-emerald-600 hover:underline" onClick={() => guardarEdit(r.id)}>Guardar</button>
                      <button className="text-xs text-slate-400 hover:underline" onClick={() => { setEditId(null); setEditForm({}); }}>Cancelar</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3">{RUBROS_TIPO.find((t) => t.value === r.tipo)?.label ?? r.tipo}</td>
                    <td className="p-3 font-mono">{money(r.valor_mensual)}</td>
                    <td className="p-3 text-center">{r.deducible ? '✓' : '—'}</td>
                    <td className="p-3 text-center">{r.afecta_aportacion ? '✓' : '—'}</td>
                    <td className="p-3 text-slate-500">{r.descripcion || '—'}</td>
                    <td className="p-3 flex gap-2">
                      <button className="text-slate-400 hover:text-slate-600" onClick={() => { setEditId(r.id); setEditForm({}); }}>
                        <Pencil size={14} />
                      </button>
                      <button className="text-slate-400 hover:text-red-500" onClick={() => eliminar(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rubros.length > 0 && (
          <div className="p-3 border-t border-slate-200 text-right text-sm font-medium">
            Total mensual: {money(rubros.filter((r) => r.activo !== false).reduce((s, r) => s + Number(r.valor_mensual), 0))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DescuentosTab({ col, onError }) {
  const [descuentos, setDescuentos] = useState([]);
  const cargar = () => api.get(`/descuentos?colaborador_id=${col.id}`).then(setDescuentos).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nuevo descuento recurrente</h2>
        <FormDescuento colaboradorId={col.id} onCreado={cargar} onError={onError} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <TablaDescuentos descuentos={descuentos} onCambio={cargar} conColaborador={false} />
      </Card>
    </div>
  );
}

function PrestamosTab({ col, onError }) {
  const [prestamos, setPrestamos] = useState([]);
  const [form, setForm] = useState({ monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' });
  const [modalAbono, setModalAbono] = useState(null);
  const [modalCuota, setModalCuota] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const cargar = () => api.get(`/prestamos?colaborador_id=${col.id}&tipo=PRESTAMO&per_page=100`)
    .then((r) => setPrestamos(r.data || r)).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/prestamos', {
        colaborador_id: col.id, tipo: 'PRESTAMO', monto_total: Number(form.monto_total),
        cuota_quincena: Number(form.cuota_quincena), fecha_inicio: form.fecha_inicio, notas: form.notas || null,
      });
      setForm({ monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' });
      toast.success('Préstamo registrado.');
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const eliminar = async (p) => {
    if (Number(p.saldo_pendiente) !== Number(p.monto_total)) {
      return onError('No se puede eliminar: el préstamo ya tiene pagos aplicados.');
    }
    const ok = await confirm({
      title: 'Eliminar préstamo',
      message: `¿Eliminar préstamo de ${money(p.monto_total)}?`,
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try { await api.del(`/prestamos/${p.id}`); toast.success('Préstamo eliminado.'); cargar(); }
    catch (err) { onError(err.message); }
  };

  const totalActivo = prestamos.filter((p) => p.activo).reduce((s, p) => s + Number(p.saldo_pendiente), 0);
  const cuotaActiva = prestamos.filter((p) => p.activo).reduce((s, p) => s + Number(p.cuota_quincena), 0);

  return (
    <div className="grid gap-4">
      {totalActivo > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo pendiente</p>
            <p className="text-2xl font-display font-bold mt-1">{money(totalActivo)}</p></Card>
          <Card><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descuento por quincena</p>
            <p className="text-2xl font-display font-bold mt-1">{money(cuotaActiva)}</p></Card>
        </div>
      )}
      <Card>
        <h2 className="font-semibold mb-3">Nuevo préstamo</h2>
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <input required type="number" step="0.01" min="0.01" placeholder="Monto total" className="input w-full"
            value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} />
          <input required type="number" step="0.01" min="0.01" placeholder="Cuota por quincena" className="input w-full"
            value={form.cuota_quincena} onChange={(e) => setForm({ ...form, cuota_quincena: e.target.value })} />
          <input required type="date" className="input w-full"
            value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" className="input w-full md:col-span-4"
            value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          La fecha es la <strong>primera quincena de descuento</strong>.
        </p>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3">1ra desc.</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => (
              <tr key={p.id} className={`border-b border-slate-200 hover:bg-slate-50 ${!p.activo && 'opacity-50'}`}>
                <td className="p-3 text-right">{money(p.monto_total)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {money(p.cuota_quincena)}
                  {p.activo && (
                    <button onClick={() => setModalCuota(p)} className="text-slate-400 hover:text-gold-600 ml-1 align-middle" title="Editar cuota">
                      <Pencil size={13} />
                    </button>
                  )}
                </td>
                <td className="p-3 text-right font-semibold">{money(p.saldo_pendiente)}</td>
                <td className="p-3 whitespace-nowrap">{fecha(p.fecha_inicio)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {p.activo && (
                    <>
                      <button onClick={() => setModalAbono({ prestamo: p, montoInicial: '' })}
                        className="btn btn-secondary !px-2.5 !py-1 text-xs">Abonar</button>
                      <button onClick={() => setModalAbono({ prestamo: p, montoInicial: p.saldo_pendiente })}
                        className="btn btn-secondary !px-2.5 !py-1 text-xs ml-1">Precancelar</button>
                    </>
                  )}
                  {Number(p.saldo_pendiente) === Number(p.monto_total) && (
                    <button onClick={() => eliminar(p)} className="text-slate-400 hover:text-red-600 ml-2 align-middle" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {prestamos.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin préstamos registrados.</td></tr>}
          </tbody>
        </table>
      </Card>

      <AbonoModal prestamo={modalAbono?.prestamo} montoInicial={modalAbono?.montoInicial}
        open={!!modalAbono} onClose={() => setModalAbono(null)} onGuardado={cargar} />
      <CuotaModal prestamo={modalCuota} open={!!modalCuota} onClose={() => setModalCuota(null)} onGuardado={cargar} />
    </div>
  );
}

function AnticiposTab({ col, onError }) {
  const [anticipos, setAnticipos] = useState([]);
  const [form, setForm] = useState({ monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' });
  const [modalAbono, setModalAbono] = useState(null);
  const [modalCuota, setModalCuota] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const cargar = () => api.get(`/prestamos?colaborador_id=${col.id}&tipo=ANTICIPO&per_page=100`)
    .then((r) => setAnticipos(r.data || r)).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/prestamos', {
        colaborador_id: col.id, tipo: 'ANTICIPO', monto_total: Number(form.monto_total),
        cuota_quincena: Number(form.cuota_quincena), fecha_inicio: form.fecha_inicio, notas: form.notas || null,
      });
      setForm({ monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' });
      toast.success('Anticipo registrado.');
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const eliminar = async (p) => {
    if (Number(p.saldo_pendiente) !== Number(p.monto_total)) {
      return onError('No se puede eliminar: el anticipo ya tiene pagos aplicados.');
    }
    const ok = await confirm({
      title: 'Eliminar anticipo',
      message: `¿Eliminar anticipo de ${money(p.monto_total)}?`,
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try { await api.del(`/prestamos/${p.id}`); toast.success('Anticipo eliminado.'); cargar(); }
    catch (err) { onError(err.message); }
  };

  const totalActivo = anticipos.filter((p) => p.activo).reduce((s, p) => s + Number(p.saldo_pendiente), 0);
  const cuotaActiva = anticipos.filter((p) => p.activo).reduce((s, p) => s + Number(p.cuota_quincena), 0);

  return (
    <div className="grid gap-4">
      {totalActivo > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo pendiente</p>
            <p className="text-2xl font-display font-bold mt-1">{money(totalActivo)}</p></Card>
          <Card><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descuento por quincena</p>
            <p className="text-2xl font-display font-bold mt-1">{money(cuotaActiva)}</p></Card>
        </div>
      )}
      <Card>
        <h2 className="font-semibold mb-3">Nuevo anticipo</h2>
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <input required type="number" step="0.01" min="0.01" placeholder="Monto total" className="input w-full"
            value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} />
          <input required type="number" step="0.01" min="0.01" placeholder="Cuota por quincena" className="input w-full"
            value={form.cuota_quincena} onChange={(e) => setForm({ ...form, cuota_quincena: e.target.value })} />
          <input required type="date" className="input w-full"
            value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" className="input w-full md:col-span-4"
            value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          La fecha es la <strong>primera quincena de descuento</strong>.
        </p>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3">1ra desc.</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {anticipos.map((p) => (
              <tr key={p.id} className={`border-b border-slate-200 hover:bg-slate-50 ${!p.activo && 'opacity-50'}`}>
                <td className="p-3 text-right">{money(p.monto_total)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {money(p.cuota_quincena)}
                  {p.activo && (
                    <button onClick={() => setModalCuota(p)} className="text-slate-400 hover:text-gold-600 ml-1 align-middle" title="Editar cuota">
                      <Pencil size={13} />
                    </button>
                  )}
                </td>
                <td className="p-3 text-right font-semibold">{money(p.saldo_pendiente)}</td>
                <td className="p-3 whitespace-nowrap">{fecha(p.fecha_inicio)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {p.activo && (
                    <>
                      <button onClick={() => setModalAbono({ prestamo: p, montoInicial: '' })}
                        className="btn btn-secondary !px-2.5 !py-1 text-xs">Abonar</button>
                      <button onClick={() => setModalAbono({ prestamo: p, montoInicial: p.saldo_pendiente })}
                        className="btn btn-secondary !px-2.5 !py-1 text-xs ml-1">Precancelar</button>
                    </>
                  )}
                  {Number(p.saldo_pendiente) === Number(p.monto_total) && (
                    <button onClick={() => eliminar(p)} className="text-slate-400 hover:text-red-600 ml-2 align-middle" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {anticipos.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin anticipos registrados.</td></tr>}
          </tbody>
        </table>
      </Card>

      <AbonoModal prestamo={modalAbono?.prestamo} montoInicial={modalAbono?.montoInicial}
        open={!!modalAbono} onClose={() => setModalAbono(null)} onGuardado={cargar} />
      <CuotaModal prestamo={modalCuota} open={!!modalCuota} onClose={() => setModalCuota(null)} onGuardado={cargar} />
    </div>
  );
}

function AusenciasTab({ col, onError }) {
  const [ausencias, setAusencias] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const cargar = () => {
    api.get(`/ausencias?colaborador_id=${col.id}`).then(setAusencias).catch((e) => onError(e.message));
    api.get(`/ausencias/saldo/${col.id}`).then(setSaldo).catch(() => {});
  };
  useEffect(() => { cargar(); }, [col.id]);
  return (
    <div className="grid gap-4">
      {saldo && (
        <div className="grid grid-cols-3 gap-4">
          {[['Derecho acumulado', saldo.derecho], ['Días tomados', saldo.tomados], ['Saldo disponible', saldo.saldo]].map(([t, v]) => (
            <Card key={t}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t}</p>
              <p className="mt-1 text-2xl font-display font-bold text-slate-900">{v} <span className="text-sm font-normal text-slate-500">días</span></p>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <h2 className="font-semibold mb-3">Registrar ausencia</h2>
        <FormAusencia colaboradorId={col.id} onCreado={cargar} onError={onError} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <TablaAusencias ausencias={ausencias} onCambio={cargar} onError={onError} conColaborador={false} gestionable />
      </Card>
    </div>
  );
}

function HorarioTab({ col, onError, onCambio }) {
  const [incidencias, setIncidencias] = useState([]);
  const [form, setForm] = useState({ fecha: '', hora_entrada_real: '', hora_salida_real: '', notas: '' });
  const toast = useToast();

  const cargar = () => api.get(`/colaboradores/${col.id}/incidencias-horario`).then(setIncidencias).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  if (!col.horario) {
    return <Card className="text-slate-500">Este colaborador no tiene un horario asignado. Asígnalo en la pestaña Ficha.</Card>;
  }

  const registrar = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/incidencias-horario`, {
        fecha: form.fecha,
        hora_entrada_real: form.hora_entrada_real || null,
        hora_salida_real: form.hora_salida_real || null,
        notas: form.notas || null,
      });
      setForm({ fecha: '', hora_entrada_real: '', hora_salida_real: '', notas: '' });
      toast.success('Incidencia registrada.');
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const aplicar = async (incidenciaId, rolPagoId) => {
    if (!rolPagoId) return;
    try {
      await api.post(`/colaboradores/${col.id}/incidencias-horario/${incidenciaId}/aplicar`, { rol_pago_id: rolPagoId });
      toast.success('Descuento aplicado al rol de pago.');
      cargar();
      onCambio();
    } catch (err) {
      onError(err.message);
    }
  };

  const eliminar = async (id) => {
    try {
      await api.del(`/colaboradores/${col.id}/incidencias-horario/${id}`);
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const rolesBorrador = col.roles_pago.filter((r) => r.periodo_estado === 'BORRADOR');

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Registrar incidencia</h2>
        <form onSubmit={registrar} className="grid md:grid-cols-4 gap-2">
          <input required type="date" className="input w-full"
            value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          <input type="time" placeholder="Hora entrada real" className="input w-full"
            value={form.hora_entrada_real} onChange={(e) => setForm({ ...form, hora_entrada_real: e.target.value })} />
          <input type="time" placeholder="Hora salida real" className="input w-full"
            value={form.hora_salida_real} onChange={(e) => setForm({ ...form, hora_salida_real: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" className="input w-full md:col-span-4"
            value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Deja la hora de entrada y/o salida real según lo que haya ocurrido ese día.
        </p>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Fecha</th><th className="p-3">Tardanza</th><th className="p-3">Salida anticipada</th>
              <th className="p-3 text-right">Descuento</th><th className="p-3">Estado</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {incidencias.map((inc) => (
              <tr key={inc.id} className="border-b border-slate-200">
                <td className="p-3">{fecha(inc.fecha)}</td>
                <td className="p-3">{inc.minutos_tardanza > 0 ? `${inc.minutos_tardanza} min` : '—'}</td>
                <td className="p-3">{inc.minutos_salida_anticipada > 0 ? `${inc.minutos_salida_anticipada} min` : '—'}</td>
                <td className="p-3 text-right font-medium">{money(inc.monto_total)}</td>
                <td className="p-3">
                  {inc.lineas_rol_id
                    ? <span className="badge bg-emerald-100 text-emerald-700">APLICADA</span>
                    : <span className="badge bg-amber-100 text-amber-700">PENDIENTE</span>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {!inc.lineas_rol_id && (
                    <>
                      <select className="input !py-1 !px-2 text-xs" defaultValue=""
                        onChange={(e) => aplicar(inc.id, e.target.value)}>
                        <option value="">Aplicar a...</option>
                        {rolesBorrador.map((r) => <option key={r.id} value={r.id}>{r.periodo_nombre}</option>)}
                      </select>
                      <button onClick={() => eliminar(inc.id)} className="text-slate-400 hover:text-red-600 ml-2 align-middle" title="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {incidencias.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-500">Sin incidencias registradas.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DocumentosColaboradorCell({ col, tipo, label, onError }) {
  const [emisiones, setEmisiones] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const cargar = () => api.get(`/colaboradores/${col.id}/documentos-emitidos/${tipo}`).then(setEmisiones).catch(() => {});
  useEffect(() => { cargar(); }, [col.id]);

  const subirFirmado = async (emisionId, e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return onError('El archivo supera los 5 MB');
    const res = await fetch(`/api/colaboradores/${col.id}/documentos-emitidos/${tipo}/${emisionId}/firmado`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
      body: archivo,
    });
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    e.target.value = '';
    cargar();
  };

  const ultima = emisiones[0];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {ultima?.archivo_generado_key && (
        <a href={`/api/colaboradores/${col.id}/documentos-emitidos/${tipo}/${ultima.id}/generado`}
          className="text-xs text-gold-600 hover:underline flex items-center gap-1">
          <Download size={12} /> Generado
        </a>
      )}
      {ultima?.archivo_firmado_key ? (
        <a href={`/api/colaboradores/${col.id}/documentos-emitidos/${tipo}/${ultima.id}/firmado`}
          className="text-xs text-emerald-700 hover:underline flex items-center gap-1">
          <Download size={12} /> Firmado
        </a>
      ) : ultima && (
        <label className="text-xs text-slate-500 cursor-pointer hover:text-gold-600">
          Subir firmado
          <input type="file" className="hidden" onChange={(e) => subirFirmado(ultima.id, e)} />
        </label>
      )}
      <button type="button" onClick={() => setModalAbierto(true)}
        className="text-xs text-slate-500 hover:text-gold-600">
        {ultima ? 'Reemitir' : 'Emitir'}
      </button>
      {modalAbierto && (
        <EmitirDocumentoColaboradorModal
          tipo={tipo} label={label} col={col}
          onClose={() => setModalAbierto(false)}
          onEmitido={() => { setModalAbierto(false); cargar(); }}
          onError={onError}
        />
      )}
    </div>
  );
}

const CAMPOS_POR_DOCUMENTO = {
  confidencialidad: [
    { key: 'cargo', label: 'Cargo / función', type: 'text', required: true },
  ],
  consentimiento_expreso: [
    { key: 'cargo', label: 'Cargo / función', type: 'text', required: true },
  ],
  consentimiento_biometrico: [],
};

function EmitirDocumentoColaboradorModal({ tipo, label, col, onClose, onEmitido, onError }) {
  const campos = CAMPOS_POR_DOCUMENTO[tipo] || [];
  const [form, setForm] = useState(Object.fromEntries(campos.map(c => [c.key, ''])));
  const [enviando, setEnviando] = useState(false);

  const emitir = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post(`/colaboradores/${col.id}/documentos-emitidos/${tipo}`, form);
      onEmitido();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Emitir ${label}`} size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button form="form-emitir-doc" disabled={enviando} className="btn btn-primary">
            {enviando ? 'Generando…' : 'Generar y descargar'}
          </button>
        </>
      }>
      <form id="form-emitir-doc" onSubmit={emitir} className="grid gap-3">
        {campos.map(c => (
          <label key={c.key} className="text-sm text-slate-600">{c.label}
            <input className="input w-full" required={c.required}
              value={form[c.key]} onChange={e => setForm({ ...form, [c.key]: e.target.value })} />
          </label>
        ))}
      </form>
    </Modal>
  );
}

const DOCUMENTOS_COLABORADOR = [
  { tipo: 'confidencialidad', label: 'Acuerdo de Confidencialidad' },
  { tipo: 'consentimiento_expreso', label: 'Consentimiento Expreso (imagen/datos)' },
  { tipo: 'consentimiento_biometrico', label: 'Consentimiento Biométrico' },
];

function DocumentosTab({ col, onError }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState('CONTRATO');
  const toast = useToast();
  const confirm = useConfirm();
  const cargar = () => api.get(`/colaboradores/${col.id}/documentos`).then(setDocs).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return onError('El archivo supera los 5 MB');
    const q = new URLSearchParams({ nombre: archivo.name, tipo });
    const res = await fetch(`/api/colaboradores/${col.id}/documentos?${q}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
      body: archivo,
    });
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    e.target.value = '';
    cargar();
  };

  const eliminar = async (d) => {
    const ok = await confirm({
      title: 'Eliminar documento',
      message: `¿Eliminar ${d.nombre}?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/colaboradores/${col.id}/documentos/${d.id}`);
      toast.success('Documento eliminado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Documentos emitibles</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Documento</th><th className="p-3">Emisión</th>
            </tr>
          </thead>
          <tbody>
            {DOCUMENTOS_COLABORADOR.map(d => (
              <tr key={d.tipo} className="border-b border-slate-200">
                <td className="p-3 font-medium">{d.label}</td>
                <td className="p-3">
                  <DocumentosColaboradorCell col={col} tipo={d.tipo} label={d.label} onError={onError} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="font-semibold mb-3">Subir documento (máx. 5 MB)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {['CONTRATO', 'CEDULA', 'CERTIFICADO', 'OTRO'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input type="file" onChange={subir}
            className="text-sm text-slate-600 file:mr-3 file:btn file:btn-secondary file:border-0" />
        </div>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Documento</th><th className="p-3">Tipo</th><th className="p-3 text-right">Tamaño</th><th className="p-3">Subido</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3 font-medium">{d.nombre}</td>
                <td className="p-3"><span className="badge bg-slate-100 text-slate-600">{d.tipo}</span></td>
                <td className="p-3 text-right">{(d.bytes / 1024).toFixed(0)} KB</td>
                <td className="p-3 text-slate-500">{fecha(d.creado_en)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <a href={`/api/colaboradores/${col.id}/documentos/${d.id}`}
                    className="inline-block text-slate-400 hover:text-gold-600 p-1.5" title="Descargar">
                    <Download size={15} />
                  </a>
                  <button onClick={() => eliminar(d)} className="text-slate-400 hover:text-red-600 p-1.5" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin documentos.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function EvaluacionesTab({ col, onError }) {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [form, setForm] = useState({ calificacion: 3, fortalezas: '', oportunidades: '' });
  const cargar = () => api.get(`/colaboradores/${col.id}/evaluaciones`).then(setEvaluaciones).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/evaluaciones`, { ...form, calificacion: Number(form.calificacion) });
      setForm({ calificacion: 3, fortalezas: '', oportunidades: '' });
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const estrellas = (n) => (
    <span className="inline-flex text-gold-500">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} fill={i <= n ? 'currentColor' : 'none'} className={i <= n ? '' : 'text-slate-300'} />)}
    </span>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nueva evaluación</h2>
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <select className="input w-full" value={form.calificacion}
            onChange={(e) => setForm({ ...form, calificacion: e.target.value })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
          </select>
          <input placeholder="Fortalezas" className="input w-full" value={form.fortalezas}
            onChange={(e) => setForm({ ...form, fortalezas: e.target.value })} />
          <input placeholder="Oportunidades de mejora" className="input w-full" value={form.oportunidades}
            onChange={(e) => setForm({ ...form, oportunidades: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
        </form>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Fecha</th><th className="p-3">Calificación</th><th className="p-3">Fortalezas</th><th className="p-3">Oportunidades</th><th className="p-3">Evaluador</th>
            </tr>
          </thead>
          <tbody>
            {evaluaciones.map((ev) => (
              <tr key={ev.id} className="border-b border-slate-200">
                <td className="p-3">{fecha(ev.fecha)}</td>
                <td className="p-3">{estrellas(ev.calificacion)}</td>
                <td className="p-3">{ev.fortalezas || '—'}</td>
                <td className="p-3">{ev.oportunidades || '—'}</td>
                <td className="p-3 text-slate-500">{ev.evaluador_email || '—'}</td>
              </tr>
            ))}
            {evaluaciones.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin evaluaciones.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FacturasTab({ col }) {
  const [facturas, setFacturas] = useState([]);
  const toast = useToast();
  const cargar = () => api.get(`/facturas?colaborador_id=${col.id}`).then(setFacturas).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, [col.id]);
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nueva factura</h2>
        <FormFactura colaboradorId={col.id} onCreado={cargar} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <TablaFacturas facturas={facturas} onCambio={cargar} conProveedor={false} />
      </Card>
    </div>
  );
}

function RolesTab({ col }) {
  return (
    <Card className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-slate-500 text-left">
          <tr className="border-b border-slate-200">
            <th className="p-3">Período</th><th className="p-3 text-right">Neto</th><th className="p-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {col.roles_pago.map((r) => (
            <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50">
              <td className="p-3">
                <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">
                  {r.periodo_nombre}
                </Link>
              </td>
              <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
              <td className="p-3"><Badge estado={r.estado_pago} /></td>
            </tr>
          ))}
          {col.roles_pago.length === 0 && <tr><td colSpan={3} className="p-4 text-slate-500">Sin roles aún.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

export default function ColaboradorDetalle() {
  const { id } = useParams();
  const [col, setCol] = useState(null);
  const [tab, setTab] = useState('Ficha');
  const [error, setError] = useState(null);

  const cargar = () => api.get(`/colaboradores/${id}`).then(setCol).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  if (!col) return <Card>{error || 'Cargando…'}</Card>;

  const tabs = col.tipo === 'EXTERNO'
    ? [...TABS_BASE.slice(0, -1), 'Facturas', 'Roles de pago']
    : TABS_BASE;

  return (
    <div className="animate-fade-in">
      <PageTitle>
        {col.nombre} <Badge estado={col.tipo} />
        {col.empresa && <span className="badge bg-slate-100 text-slate-600 ml-1">{col.empresa}</span>}
      </PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => { setTab(t); setError(null); }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-white border border-b-0 border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ficha' && <FichaTab col={col} onGuardado={() => { setError(null); cargar(); }} onError={setError} />}
      {tab === 'Horario' && <HorarioTab col={col} onError={setError} onCambio={() => { setError(null); cargar(); }} />}
      {tab === 'Contratos' && <ContratosTab col={col} onCambio={() => { setError(null); cargar(); }} onError={setError} />}
      {tab === 'Ingresos' && <RubrosIngresosTab col={col} onError={setError} />}
      {tab === 'Descuentos' && <DescuentosTab col={col} onError={setError} />}
      {tab === 'Préstamos' && <PrestamosTab col={col} onError={setError} />}
      {tab === 'Anticipos' && <AnticiposTab col={col} onError={setError} />}
      {tab === 'Ausencias' && <AusenciasTab col={col} onError={setError} />}
      {tab === 'Documentos' && <DocumentosTab col={col} onError={setError} />}
      {tab === 'Evaluaciones' && <EvaluacionesTab col={col} onError={setError} />}
      {tab === 'Facturas' && <FacturasTab col={col} />}
      {tab === 'Roles de pago' && <RolesTab col={col} />}
    </div>
  );
}
