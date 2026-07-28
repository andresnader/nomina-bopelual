import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../api.js';
import { money } from '../utils.js';

const EMPRESAS = ['BOPELUAL S.A.', 'CARROS-YA S.A.'];
const SECCIONES = [
  { tipo: 'IESS', etiqueta: 'IESS' },
  { tipo: 'EXTERNO', etiqueta: 'Externo' },
];
const CLASIFICACIONES = [
  { valor: 'ADMINISTRATIVO', etiqueta: 'Administrativo' },
  { valor: 'COMERCIAL', etiqueta: 'Comercial' },
];

function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

// Matriz de exportación de TXT: IESS/EXTERNO × ADMINISTRATIVO/COMERCIAL, con
// un botón por empresa (y por quincena si `quincenas` viene con más de un
// valor — desde la vista de un mes completo; si se omite, se asume que
// `periodoId` ya es una quincena puntual y no hace falta el parámetro).
export default function ExportarTxtMatriz({ periodoId, quincenas }) {
  const [combinaciones, setCombinaciones] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.get(`/periodos/combinaciones?periodo_id=${periodoId}`)
      .then((r) => setCombinaciones(r.combinaciones))
      .catch(() => setCombinaciones([]));
  }, [periodoId]);

  const conteo = (tipo, clasificacion, empresa, quincena) => {
    const fila = combinaciones.find((c) =>
      c.tipo === tipo && c.clasificacion === clasificacion && c.empresa === empresa
      && (quincena == null || c.quincena === quincena));
    return fila?.count ?? 0;
  };

  const descargar = async (tipo, clasificacion, empresa, quincena) => {
    setResultado(null);
    setCargando(true);
    try {
      const q = new URLSearchParams({ tipo, clasificacion, empresa });
      if (quincena) q.set('quincena', quincena);
      const r = await api.get(`/periodos/${periodoId}/txt-pago?${q}`);
      if (r.incluidos > 0) descargarBlob(r.archivo, new Blob([r.contenido], { type: 'text/plain' }));
      setResultado(r);
    } catch (e) {
      setResultado({ error: e.message });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      {SECCIONES.map((sec) => (
        <div key={sec.tipo} className="mb-4 last:mb-0">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{sec.etiqueta}</h3>
          <div className="space-y-2">
            {CLASIFICACIONES.map((clasif) => (
              <div key={clasif.valor} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted w-28 shrink-0">{clasif.etiqueta}</span>
                {EMPRESAS.map((empresa) => (quincenas?.length ? quincenas : [null]).map((q) => {
                  const n = conteo(sec.tipo, clasif.valor, empresa, q);
                  return (
                    <button
                      key={`${empresa}-${q ?? 'u'}`}
                      disabled={n === 0 || cargando}
                      onClick={() => descargar(sec.tipo, clasif.valor, empresa, q)}
                      className="btn btn-secondary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download size={13} /> {empresa}{q ? ` Q${q}` : ''} ({n})
                    </button>
                  );
                }))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {resultado?.error && <p className="text-sm text-red-600 mt-2">{resultado.error}</p>}
      {resultado && !resultado.error && (
        <div className="text-sm mt-3 pt-3 border-t border-dashed border-slate-200 space-y-1">
          <p className="text-muted">
            {resultado.incluidos > 0
              ? <>Archivo <span className="font-medium">{resultado.archivo}</span>: {resultado.incluidos} transferencias por {money(resultado.total)}.</>
              : 'Ninguna transferencia con ese filtro.'}
          </p>
          {resultado.excluidos?.length > 0 && (
            <p className="text-amber-600">
              Excluidos ({resultado.excluidos.length}): {resultado.excluidos.map((e) => `${e.nombre} (${e.motivo})`).join(', ')}.
            </p>
          )}
          {resultado.warnings?.length > 0 && resultado.warnings.map((w, i) => (
            <p key={i} className="text-amber-600">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
