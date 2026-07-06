// Tasas oficiales de Ecuador — única fuente de estos números en todo el código.
// Ningún otro módulo debe escribir estos literales.
export const TASAS = Object.freeze({
  IESS_PERSONAL: 0.0945, // aporte personal del afiliado (descuento)
  IESS_PATRONAL: 0.1215, // aporte patronal (costo del empleador, para reportes)
  FONDOS_RESERVA: 0.0833, // 8.33% a partir del mes 13 de afiliación
  RETENCION_FUENTE: 0.1, // 10% sobre factura de proveedor externo
  UTILIDADES: 0.15 // 15% de la utilidad líquida
});
