-- Rubros de ingreso proyectados por colaborador.
-- Permite configurar ingresos fijos adicionales al sueldo base
-- (alimentación, transporte, vivienda, comisiones, etc.).
CREATE TABLE IF NOT EXISTS rubros_ingreso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo text NOT NULL,               -- SUELDO, ALIMENTACION, TRANSPORTE, VIVIENDA, COMISIONES, HORAS_EXTRA, BONO, OTROS
  valor_mensual numeric(12,2) NOT NULL,
  deducible boolean NOT NULL DEFAULT true,    -- afecta cálculo de impuesto a la renta
  afecta_aportacion boolean NOT NULL DEFAULT true, -- suma a base imponible IESS (9.45%)
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rubros_ingreso_col ON rubros_ingreso(colaborador_id, activo);
