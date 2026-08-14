-- Permite crear períodos exclusivos para una empresa específica.
-- Si es NULL, el período abarca a todas las empresas (comportamiento legacy/por defecto).

ALTER TABLE periodos
  ADD COLUMN empresa text REFERENCES config_empresas(empresa);
