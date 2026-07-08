-- Porcentaje de anticipo de 1ra quincena por colaborador.
-- NULL = usa el parámetro global PORCENTAJE_ANTICIPO (40%). En la nómina real
-- de junio la mayoría cobra 40/60 pero algunos (Boloña, Cruz García) usan 50/50.
ALTER TABLE colaboradores
  ADD COLUMN pct_anticipo numeric(4,3) CHECK (pct_anticipo > 0 AND pct_anticipo < 1);
