import { useState } from 'react';
import { Modal } from './Modal.jsx';
import OmitidosAviso from './OmitidosAviso.jsx';
import { api } from '../api.js';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const EMPRESAS = ['BOPELUAL S.A.', 'CARROS-YA S.A.'];

function anios() {
  const actual = new Date().getFullYear();
  const lista = [];
  for (let a = 2020; a <= actual + 1; a++) lista.push(a);
  return lista;
}

// Wizard de creación de un mes completo: crea el período padre + sus dos
// quincenas hijas (POST /periodos/desde-mes) y genera roles automáticamente
// en las quincenas que ya hayan comenzado.
export default function NuevoMesModal({ open, onClose, onCreado }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [empresa, setEmpresa] = useState('');
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);
  // Colaboradores activos que no entraron al mes recién creado. Mientras haya
  // alguno el modal se queda abierto mostrándolos: el mes YA se creó (no es un
  // error), pero si esa lista se pierde nadie se entera de que faltan.
  const [omitidos, setOmitidos] = useState(null);

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    setCreando(true);
    try {
      const r = await api.post('/periodos/desde-mes', { anio: Number(anio), mes: Number(mes), empresa });
      onCreado(r);
      if (r.omitidos?.length) setOmitidos(r.omitidos);
      else onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreando(false);
    }
  };

  const cerrar = () => {
    setOmitidos(null);
    onClose();
  };

  if (omitidos) {
    return (
      <Modal open={open} onClose={cerrar} title="Mes creado, con avisos" size="sm"
        footer={<button type="button" onClick={cerrar} className="btn btn-primary">Entendido</button>}>
        <OmitidosAviso omitidos={omitidos} />
        <p className="mt-3 text-xs text-muted">
          El mes se creó igual. Corregí sus fichas y volvé a sincronizar el período para que entren.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo mes completo" size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button type="submit" form="form-nuevo-mes" disabled={creando} className="btn btn-primary disabled:opacity-50">
            {creando ? 'Creando…' : 'Crear mes'}
          </button>
        </>
      }>
      <form id="form-nuevo-mes" onSubmit={crear} className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Año</label>
          <select className="input" value={anio} onChange={(e) => setAnio(e.target.value)}>
            {anios().map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Mes</label>
          <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
            {MESES.map((nombre, i) => <option key={nombre} value={i + 1}>{nombre}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Empresa</label>
          <select className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="">Todas (Ambas empresas)</option>
            {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <p className="col-span-2 text-xs text-muted">
          Crea las dos quincenas del mes y genera los roles de las que ya hayan comenzado.
        </p>
      </form>
    </Modal>
  );
}
