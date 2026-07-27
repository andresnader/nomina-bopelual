-- Historial de vínculos laborales de EMPRESA (distinto de las fechas del IESS).
-- Cada fila = un período de empleo con su entrada y su salida (NULL = activo).
-- Es la fuente de verdad de las fechas que usa la nómina; soporta re-ingresos.
CREATE TABLE empleo_periodos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha_entrada  date NOT NULL,
  fecha_salida   date,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_salida IS NULL OR fecha_salida >= fecha_entrada)
);
CREATE INDEX empleo_periodos_colaborador_idx ON empleo_periodos (colaborador_id, fecha_entrada);

-- Backfill: un vínculo por colaborador existente con sus fechas actuales.
INSERT INTO empleo_periodos (colaborador_id, fecha_entrada, fecha_salida)
  SELECT id, COALESCE(fecha_ingreso, creado_en::date), fecha_salida
  FROM colaboradores;
