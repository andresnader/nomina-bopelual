-- Fecha límite opcional de un descuento recurrente. NULL = indefinido,
-- mismo criterio que cuotas_restantes. La desactivación es perezosa: se
-- aplica la primera vez que un período con fecha_inicio posterior la toca
-- (ver aplicarDescuentosPendientes en services/periodos.js).
ALTER TABLE descuentos_recurrentes
  ADD COLUMN fecha_vencimiento date;
