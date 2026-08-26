-- Tasa personal de IESS especial por colaborador.
-- NULL = usa la tasa estándar TASAS.IESS_PERSONAL (9.45%). Un valor fijo aquí
-- la reemplaza para ese colaborador (ej. Boloña, Gerente General, 17.60%).
-- Se aplica en el mismo punto donde hoy se calcula el IESS_PERSONAL (2da
-- quincena, sobre el sueldo mensual completo), así que no requiere ningún
-- cambio de período: el IESS ya se paga "a fin de mes".
ALTER TABLE colaboradores
  ADD COLUMN iess_tasa_personal_especial numeric(5,4)
  CHECK (iess_tasa_personal_especial > 0 AND iess_tasa_personal_especial < 1);
