-- Fase 2: talento humano y descuentos recurrentes.
-- Ver docs/superpowers/specs/2026-07-07-fase2-talento-humano-design.md

-- Descuentos que se aplican solos al generar cada período (como los préstamos).
-- aplicar_en: 0 = ambas quincenas, 1 = solo primera, 2 = solo segunda.
-- cuotas_restantes NULL = indefinido; con valor se decrementa y desactiva en 0.
CREATE TABLE descuentos_recurrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo_linea text NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  aplicar_en int NOT NULL DEFAULT 0 CHECK (aplicar_en IN (0,1,2)),
  cuotas_restantes int CHECK (cuotas_restantes >= 0),
  activo boolean NOT NULL DEFAULT true,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_descuentos_colaborador ON descuentos_recurrentes(colaborador_id) WHERE activo;

CREATE TABLE ausencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('VACACIONES','PERMISO','ENFERMEDAD','LICENCIA')),
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  dias numeric(5,2) NOT NULL CHECK (dias > 0),
  estado text NOT NULL DEFAULT 'SOLICITADA' CHECK (estado IN ('SOLICITADA','APROBADA','RECHAZADA')),
  motivo text,
  aprobado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde)
);
CREATE INDEX idx_ausencias_colaborador ON ausencias(colaborador_id);
CREATE INDEX idx_ausencias_estado ON ausencias(estado) WHERE estado = 'SOLICITADA';

-- Archivos en bytea: Railway no tiene disco persistente y el volumen es bajo.
CREATE TABLE documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'OTRO' CHECK (tipo IN ('CONTRATO','CEDULA','CERTIFICADO','OTRO')),
  mime text NOT NULL DEFAULT 'application/octet-stream',
  archivo bytea NOT NULL,
  subido_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documentos_colaborador ON documentos(colaborador_id);

CREATE TABLE evaluaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  calificacion int NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  fortalezas text,
  oportunidades text,
  evaluador_id uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evaluaciones_colaborador ON evaluaciones(colaborador_id);

INSERT INTO parametros (clave, valor) VALUES ('DIAS_VACACIONES_ANIO','15') ON CONFLICT DO NOTHING;
