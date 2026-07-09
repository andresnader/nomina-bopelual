-- Catálogo editable de tipos de contrato. Reemplaza el CHECK fijo agregado
-- en 009_datos_personales.sql (mismo patrón que servicios_descuento).
CREATE TABLE IF NOT EXISTS tipos_contrato (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tipos_contrato (codigo, nombre) VALUES
  ('PRODUCTIVO', 'Contrato productivo'),
  ('INDEFINIDO', 'Contrato indefinido'),
  ('ESPECIAL_EMERGENTE', 'Contrato especial emergente'),
  ('JUVENIL', 'Contrato juvenil'),
  ('TEMPORAL', 'Contrato temporal')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE contratos DROP CONSTRAINT IF EXISTS contratos_tipo_contrato_check;
