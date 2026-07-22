-- Fecha de salida (último día trabajado) del colaborador. Junto con
-- fecha_ingreso define los días efectivos del período: la nómina prorratea
-- sueldo/bono/rubros hasta el día que trabajó. NULL = sigue activo.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS fecha_salida date;
