-- Campos requeridos para importar la nómina real y generar el TXT de pago
-- masivo (Cash Management Banco Pichincha): datos bancarios del colaborador
-- y dimensión empresa / centro de costo (BOPELUAL S.A. vs CARROS-YA S.A.).
ALTER TABLE colaboradores
  ADD COLUMN empresa text,
  ADD COLUMN centro_costo text,
  ADD COLUMN cargas_personales int NOT NULL DEFAULT 0,
  ADD COLUMN forma_pago text NOT NULL DEFAULT 'TRANSFERENCIA',
  ADD COLUMN banco text,
  ADD COLUMN codigo_banco text,
  ADD COLUMN tipo_cuenta text CHECK (tipo_cuenta IN ('AHORRO','CORRIENTE')),
  ADD COLUMN cuenta_bancaria text;

COMMENT ON COLUMN colaboradores.codigo_banco IS
  'Código de institución financiera del catálogo Cash Management Pichincha (10=Pichincha, 17=Guayaquil, 30=Pacífico, 36=Produbanco, 37=Bolivariano)';
