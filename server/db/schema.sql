-- SOLO DESARROLLO: recrea todo desde cero. Producción usa las migraciones.
-- Uso: psql "$DATABASE_URL" -f db/schema.sql
DROP TABLE IF EXISTS lineas_rol, roles_pago, facturas_proveedor, prestamos,
  provisiones, contratos, periodos, colaboradores, usuarios, parametros, _migraciones CASCADE;
\i migrations/001_init.sql
