-- Historial de abonos y precancelaciones de préstamos (auditoría).
-- Las cuotas descontadas por nómina siguen viviendo en lineas_rol; aquí van
-- los pagos extraordinarios hechos fuera del rol.
CREATE TABLE abonos_prestamo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id uuid NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  notas text,
  registrado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_abonos_prestamo ON abonos_prestamo(prestamo_id);
