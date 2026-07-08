-- Datos personales adicionales pedidos por RRHH para el expediente del
-- colaborador, y tipo de contrato en el historial de contratos (puede
-- cambiar al renovar/convertir, igual que sueldo_base).
ALTER TABLE colaboradores
  ADD COLUMN fecha_nacimiento date,
  ADD COLUMN sexo text CHECK (sexo IN ('M','F')),
  ADD COLUMN estado_civil text CHECK (estado_civil IN ('SOLTERO','CASADO','DIVORCIADO','VIUDO','UNION_LIBRE')),
  ADD COLUMN direccion text;

ALTER TABLE contratos
  ADD COLUMN tipo_contrato text CHECK (tipo_contrato IN ('INDEFINIDO','PLAZO_FIJO','PASANTIA','PRESTACION_SERVICIOS'));
