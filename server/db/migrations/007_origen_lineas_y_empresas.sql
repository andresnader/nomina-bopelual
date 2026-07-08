-- Trazabilidad de origen en lineas_rol (para poder sincronizar un rol sin
-- duplicar líneas ya aplicadas) + configuración de retención por empresa +
-- empresa denormalizada en facturas.
ALTER TABLE lineas_rol
  ADD COLUMN prestamo_id uuid REFERENCES prestamos(id),
  ADD COLUMN descuento_recurrente_id uuid REFERENCES descuentos_recurrentes(id);

CREATE TABLE config_empresas (
  empresa text PRIMARY KEY,
  aplica_retencion boolean NOT NULL DEFAULT true
);
INSERT INTO config_empresas (empresa, aplica_retencion) VALUES
  ('BOPELUAL S.A.', true),
  ('CARROS-YA S.A.', false)
ON CONFLICT DO NOTHING;

ALTER TABLE facturas_proveedor
  ADD COLUMN empresa text REFERENCES config_empresas(empresa) DEFAULT 'BOPELUAL S.A.';
