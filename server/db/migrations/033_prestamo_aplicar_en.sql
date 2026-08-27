-- Quincena en la que se descuenta la cuota de un préstamo/anticipo.
-- Mismo esquema que descuentos_recurrentes.aplicar_en: 0 = ambas quincenas
-- (comportamiento actual, default), 1 = solo primera, 2 = solo segunda.
ALTER TABLE prestamos
  ADD COLUMN aplicar_en int NOT NULL DEFAULT 0 CHECK (aplicar_en IN (0,1,2));
