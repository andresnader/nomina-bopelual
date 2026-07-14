-- Flags de configuración laboral por colaborador.
-- acumular_decimos: si true, se provisiona mensualmente el 1/12 del décimo tercero y cuarto.
-- acumular_fondos_reserva: si true, se provisiona mensualmente (vs pagar al cumplir 1 año).
-- extension_conyugal: si true, se extiende la cobertura del IESS al cónyuge.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS acumular_decimos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acumular_fondos_reserva boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extension_conyugal boolean NOT NULL DEFAULT false;
