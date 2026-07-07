CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  nombre text,
  rol text NOT NULL CHECK (rol IN ('ADMIN','RRHH','COLABORADOR','GERENCIA')),
  colaborador_id uuid,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('IESS','EXTERNO')),
  cedula text UNIQUE,
  nombre text NOT NULL,
  email text,
  departamento text,
  cargo text,
  fecha_ingreso date,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  sueldo_base numeric(12,2) NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  quincena int NOT NULL CHECK (quincena IN (1,2)),
  estado text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','APROBADO','CERRADO')),
  creado_por uuid REFERENCES usuarios(id),
  aprobado_por uuid REFERENCES usuarios(id),
  cerrado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id),
  total_ingresos numeric(12,2) NOT NULL DEFAULT 0,
  total_descuentos numeric(12,2) NOT NULL DEFAULT 0,
  neto numeric(12,2) NOT NULL DEFAULT 0,
  estado_pago text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_pago IN ('PENDIENTE','PAGADO')),
  pagado_en timestamptz,
  UNIQUE (periodo_id, colaborador_id)
);

CREATE TABLE lineas_rol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_pago_id uuid NOT NULL REFERENCES roles_pago(id) ON DELETE CASCADE,
  tipo_linea text NOT NULL,
  clase text NOT NULL CHECK (clase IN ('INGRESO','DESCUENTO')),
  monto numeric(12,2) NOT NULL,
  descripcion text,
  es_provision boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  anio int NOT NULL,
  decimo_tercero numeric(12,2) NOT NULL DEFAULT 0,
  decimo_cuarto numeric(12,2) NOT NULL DEFAULT 0,
  fondos_reserva numeric(12,2) NOT NULL DEFAULT 0,
  utilidades numeric(12,2) NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, anio)
);

CREATE TABLE prestamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  monto_total numeric(12,2) NOT NULL,
  cuota_quincena numeric(12,2) NOT NULL,
  saldo_pendiente numeric(12,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  fecha_inicio date NOT NULL,
  notas text
);

CREATE TABLE facturas_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id),
  periodo_id uuid REFERENCES periodos(id),
  numero_factura text,
  fecha_factura date,
  monto_bruto numeric(12,2) NOT NULL,
  retencion_10pct numeric(12,2) NOT NULL,
  neto numeric(12,2) NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADA')),
  pagada_en timestamptz
);

CREATE TABLE parametros (
  clave text PRIMARY KEY,
  valor text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO parametros (clave, valor) VALUES ('SBU','460.00') ON CONFLICT DO NOTHING;
INSERT INTO parametros (clave, valor) VALUES ('PORCENTAJE_ANTICIPO','0.40') ON CONFLICT DO NOTHING;
