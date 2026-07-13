-- Datos legales por empresa para poder emitir contratos (RUC, representante
-- legal y su cédula), e historial de emisiones de contrato: un contrato
-- puede reemitirse/corregirse, cada fila es una emisión con el .docx
-- generado y, opcionalmente, el escaneado firmado. Ambos archivos viven en
-- el bucket S3-compatible de Railway (ver server/src/lib/storage.js), no en
-- bytea como la tabla documentos.
ALTER TABLE config_empresas
  ADD COLUMN ruc text,
  ADD COLUMN representante_legal text,
  ADD COLUMN cedula_representante text;

UPDATE config_empresas SET
  ruc = '0993316237001',
  representante_legal = 'Miguel Velez Pérez',
  cedula_representante = '0911764975'
WHERE empresa = 'BOPELUAL S.A.';

UPDATE config_empresas SET
  ruc = '0993074357001',
  representante_legal = 'Alejandro Boloña Baux',
  cedula_representante = '0920303997'
WHERE empresa = 'CARROS-YA S.A.';

CREATE TABLE contrato_emisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  funciones text NOT NULL,
  remuneracion_letras text NOT NULL,
  horas_semanales text NOT NULL,
  horas_diarias text NOT NULL,
  dias_descanso text NOT NULL,
  duracion_texto text NOT NULL,
  periodo_prueba_texto text NOT NULL,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);
