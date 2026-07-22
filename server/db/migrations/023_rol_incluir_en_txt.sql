-- Marca por rol si el colaborador se paga por el TXT masivo del banco o por
-- otro medio (cheque, efectivo, etc.). Por defecto todos entran en el TXT
-- (comportamiento anterior); RRHH/Admin desmarca desde la vista del período.
-- El Excel de la nómina siempre incluye a TODOS, esta marca solo filtra el TXT.
ALTER TABLE roles_pago
  ADD COLUMN IF NOT EXISTS incluir_en_txt boolean NOT NULL DEFAULT true;
