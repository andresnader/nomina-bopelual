-- Catálogo de horarios (usado para calcular descuentos por incumplimiento
-- de horario) y tabla de incidencias registradas manualmente. La
-- aplicación a nómina es una acción separada y manual (ver
-- incidencias-horario.js): registrar una incidencia solo calcula y guarda
-- el monto, no toca lineas_rol hasta que se aplica explícitamente.
CREATE TABLE horarios (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  hora_entrada_semana time NOT NULL,
  hora_salida_semana time NOT NULL,
  hora_entrada_sabado time NOT NULL,
  hora_salida_sabado time NOT NULL,
  horas_jornada_semana numeric(4,2) NOT NULL,
  horas_jornada_sabado numeric(4,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO horarios
  (codigo, nombre, hora_entrada_semana, hora_salida_semana, hora_entrada_sabado, hora_salida_sabado, horas_jornada_semana, horas_jornada_sabado)
VALUES
  ('ADM', 'Administrativo', '08:30', '17:30', '10:00', '14:00', 8, 4),
  ('COMERCIAL', 'Comercial', '09:00', '17:30', '10:00', '14:00', 8, 4);

ALTER TABLE colaboradores ADD COLUMN horario text REFERENCES horarios(codigo);

INSERT INTO parametros (clave, valor) VALUES ('MINUTOS_GRACIA', '5') ON CONFLICT DO NOTHING;

CREATE TABLE incidencias_horario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  hora_entrada_real time,
  hora_salida_real time,
  minutos_tardanza int NOT NULL DEFAULT 0,
  minutos_salida_anticipada int NOT NULL DEFAULT 0,
  monto_total numeric(10,2) NOT NULL,
  notas text,
  lineas_rol_id uuid REFERENCES lineas_rol(id),
  creado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_entrada_real IS NOT NULL OR hora_salida_real IS NOT NULL)
);
CREATE INDEX idx_incidencias_horario_colaborador ON incidencias_horario(colaborador_id);

ALTER TABLE lineas_rol
  ADD COLUMN incidencia_horario_id uuid REFERENCES incidencias_horario(id);
