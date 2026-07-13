-- Tablas para cada tipo de documento emitible, asociados al colaborador
-- (no al contrato). Cada tabla sigue el mismo patrón que contrato_emisiones
-- pero con campos específicos del tipo de documento.

-- 1. Acuerdo de Confidencialidad (NDA)
CREATE TABLE colaborador_confidencialidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  cargo text NOT NULL,
  fecha_celebracion date NOT NULL DEFAULT CURRENT_DATE,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);

-- 2. Anexo de Consentimiento Expreso (uso de imagen y datos)
CREATE TABLE colaborador_consentimiento_expreso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  cargo text NOT NULL,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);

-- 3. Consentimiento Biométrico
CREATE TABLE colaborador_consentimiento_biometrico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);

-- 4. Contrato Agente Comisionista (asociado a contratos)
CREATE TABLE contrato_comisionista_emisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  comision_porcentaje text NOT NULL,
  anexo_productos text NOT NULL,
  anexo_precios text NOT NULL,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);

-- 5. Contrato de Prestación de Servicios Profesionales
CREATE TABLE contrato_servicios_profesionales_emisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  honorarios_letras text NOT NULL,
  honorarios_numero numeric(12,2) NOT NULL,
  honorarios_mes12_letras text,
  honorarios_mes12_numero numeric(12,2),
  plazo_meses int NOT NULL DEFAULT 12,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);

-- Agregar COMISIONISTA y SERVICIOS_PROFESIONALES al catálogo
INSERT INTO tipos_contrato (codigo, nombre) VALUES
  ('COMISIONISTA', 'Contrato agente comisionista'),
  ('SERVICIOS_PROFESIONALES', 'Contrato prestación servicios profesionales')
ON CONFLICT (codigo) DO NOTHING;

-- Vista de contratos próximos a vencer (próximos 30 días)
CREATE VIEW contratos_proximos_vencer AS
SELECT
  c.id,
  c.fecha_inicio,
  c.fecha_fin,
  c.tipo_contrato,
  col.id AS colaborador_id,
  col.nombre AS colaborador_nombre,
  col.cedula AS colaborador_cedula,
  col.empresa,
  CASE
    WHEN c.fecha_fin IS NULL THEN 'SIN_FECHA_FIN'
    WHEN c.fecha_fin < CURRENT_DATE THEN 'VENCIDO'
    WHEN c.fecha_fin <= CURRENT_DATE + INTERVAL '7 days' THEN 'VENCE_ESTA_SEMANA'
    WHEN c.fecha_fin <= CURRENT_DATE + INTERVAL '30 days' THEN 'VENCE_PROXIMOS_30_DIAS'
    ELSE 'VIGENTE'
  END AS estado_vencimiento
FROM contratos c
JOIN colaboradores col ON col.id = c.colaborador_id
WHERE c.fecha_fin IS NOT NULL
  AND c.fecha_fin <= CURRENT_DATE + INTERVAL '30 days';
