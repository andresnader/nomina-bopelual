-- Registro puntual de horas extras trabajadas fuera del horario regular.
-- Sigue el mismo patrón que incidencias_horario: registrar solo calcula y
-- guarda el monto, no toca lineas_rol hasta que se aplica explícitamente.
--
-- La clasificación es automática por fecha (Código de Trabajo, y el mismo
-- criterio del archivo de referencia del Ministerio de Trabajo):
--   SUPLEMENTARIA (50%): horas trabajadas en día laborable (lunes a viernes).
--   EXTRAORDINARIA (100%): horas trabajadas sábado o domingo.
-- No modela feriados, horario nocturno (00h-06h), ni sesiones que cruzan
-- medianoche — fuera del alcance del archivo de referencia.
--
-- El valor de la hora normal sale de un parámetro global (no del horario de
-- cada colaborador), igual que en el archivo de referencia: sueldo mensual /
-- HORAS_LABORALES_MES.
INSERT INTO parametros (clave, valor) VALUES ('HORAS_LABORALES_MES', '240') ON CONFLICT DO NOTHING;

CREATE TABLE horas_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  hora_entrada time NOT NULL,
  hora_salida time NOT NULL,
  tipo_hora text NOT NULL CHECK (tipo_hora IN ('SUPLEMENTARIA', 'EXTRAORDINARIA')),
  horas numeric(5,2) NOT NULL,
  monto_total numeric(10,2) NOT NULL,
  notas text,
  lineas_rol_id uuid REFERENCES lineas_rol(id),
  creado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_salida > hora_entrada)
);
CREATE INDEX idx_horas_extras_colaborador ON horas_extras(colaborador_id);

ALTER TABLE lineas_rol
  ADD COLUMN horas_extras_id uuid REFERENCES horas_extras(id);
