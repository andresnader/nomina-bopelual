-- SOLO DESARROLLO: recrea todo desde cero. Producción usa las migraciones.
-- Uso: psql "$DATABASE_URL" -f db/schema.sql
DROP TABLE IF EXISTS lineas_rol, roles_pago, facturas_proveedor, abonos_prestamo, prestamos,
  provisiones, contratos, periodos, colaboradores, usuarios, parametros, _migraciones,
  descuentos_recurrentes, ausencias, documentos, evaluaciones, bancos CASCADE;
\i migrations/001_init.sql
\i migrations/002_datos_bancarios_empresa.sql
\i migrations/003_talento_humano.sql
\i migrations/004_pct_anticipo_colaborador.sql
\i migrations/005_abonos_prestamo.sql
\i migrations/006_bancos.sql
