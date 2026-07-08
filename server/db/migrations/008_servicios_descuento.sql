-- Catálogo editable de servicios / conceptos de descuento.
-- Reemplaza el array hardcodeado TIPOS_DESCUENTO en tipos-descuento.js.
CREATE TABLE IF NOT EXISTS servicios_descuento (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO servicios_descuento (codigo, nombre) VALUES
  ('ALIMENTACION', 'Alimentación'),
  ('COMISARIATO', 'Comisariato'),
  ('SALUDSA', 'SaludSA'),
  ('MEC', 'MEC'),
  ('NEC', 'NEC'),
  ('CUOTA_PLAN', 'Cuota plan'),
  ('PLAN_VEHICULAR', 'Plan vehicular'),
  ('UNIFORMES', 'Uniformes'),
  ('SEGURO', 'Seguro'),
  ('PENSION_ALIMENTICIA', 'Pensión alimenticia'),
  ('LENTES', 'Lentes'),
  ('ANTICIPO_SUELDO', 'Anticipo de sueldo'),
  ('PRESTAMO_HIPOTECARIO', 'Préstamo hipotecario'),
  ('PRESTAMO_QUIROGRAFARIO', 'Préstamo quirografario'),
  ('DESCUENTO_VARIOS', 'Descuento varios')
ON CONFLICT (codigo) DO NOTHING;
