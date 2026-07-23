-- Aprobación por grupo (empresa × grupo de pago) dentro de un período. Fila
-- presente = grupo aprobado (y bloqueado de edición mientras el período está en
-- BORRADOR). Sin fila = pendiente.
CREATE TABLE aprobaciones_grupo (
  periodo_id   uuid NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  empresa      text NOT NULL,
  grupo        text NOT NULL CHECK (grupo IN ('COMERCIAL','ADM','SERV_PROF')),
  aprobado_por uuid REFERENCES usuarios(id),
  aprobado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (periodo_id, empresa, grupo)
);
