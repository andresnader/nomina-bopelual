-- Clasificación Comercial/Administrativo por colaborador. Antes el archivo de
-- pago masivo (txt-pichincha) adivinaba el grupo comparando el texto libre de
-- Departamento contra 'VENTAS'/'COMERCIAL'; ahora es un campo explícito.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS clasificacion text CHECK (clasificacion IN ('COMERCIAL', 'ADMINISTRATIVO'));
UPDATE colaboradores SET clasificacion = 'ADMINISTRATIVO' WHERE clasificacion IS NULL;
ALTER TABLE colaboradores ALTER COLUMN clasificacion SET DEFAULT 'ADMINISTRATIVO';
ALTER TABLE colaboradores ALTER COLUMN clasificacion SET NOT NULL;

-- Los nombres se guardan siempre en mayúsculas (el server normaliza los
-- nuevos al guardar; esto corrige los ya existentes).
UPDATE colaboradores SET nombre = UPPER(nombre) WHERE nombre <> UPPER(nombre);

-- Conceptos de descuento pedidos por RRHH que faltaban en el catálogo.
INSERT INTO servicios_descuento (codigo, nombre) VALUES
  ('SMILE_DENTAL', 'Smile Dental'),
  ('ALMACENES_TIA', 'Almacenes Tía'),
  ('OTROS', 'Otros')
ON CONFLICT (codigo) DO NOTHING;
