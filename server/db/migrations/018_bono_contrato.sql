-- Bono mensual por colaborador, configurable en el contrato.
-- Se divide automáticamente entre quincenas usando el pct_anticipo del colaborador
-- (misma lógica que el sueldo: 40% en 1ra quincena, 60% en 2da quincena).
ALTER TABLE contratos
  ADD COLUMN bono numeric(12,2) NOT NULL DEFAULT 0;
