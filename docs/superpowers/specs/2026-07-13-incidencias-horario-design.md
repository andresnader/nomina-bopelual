# Descuentos por incumplimiento de horario (tardanzas / salidas anticipadas)

**Fecha**: 2026-07-13 · **Estado**: aprobado por Andrés

## Contexto

Elena, quien administrará la plataforma, necesita poder registrar cuando un
colaborador llega tarde o sale antes de su horario, y que el sistema calcule
el descuento correspondiente en proporción al tiempo no trabajado. Hoy
existen dos horarios: personal administrativo (8:30-5:30 lunes a viernes,
10:00-2:00 sábados) y personal comercial (9:00-5:30 lunes a viernes,
10:00-2:00 sábados). No existe ninguna infraestructura de horarios,
asistencia ni descuentos por minutos en el proyecto — es una funcionalidad
nueva desde cero.

## Decisiones confirmadas

1. **Registro manual, no importación de reloj biométrico.** Elena registra
   a mano cada incidencia (fecha, hora real de entrada y/o salida). No hay
   integración con un reloj biométrico ni importación masiva.
2. **Un registro por colaborador+fecha, con ambos campos opcionales.** Un
   mismo día puede tener llegada tarde, salida anticipada, ambas o ninguna
   — es un solo formulario con `hora_entrada_real` y `hora_salida_real`
   opcionales, no incidencias separadas por tipo.
3. **Tarifa por minuto**: `sueldo_base ÷ 30 ÷ horas_jornada ÷ 60`.
   `horas_jornada` = 8 para días de semana (ADM y Comercial), 4 para
   sábado — se asume una hora de almuerzo sin pago entre semana.
4. **5 minutos de gracia**, configurable vía la tabla `parametros` existente
   (`MINUTOS_GRACIA`), no hardcodeado. Se resta el exceso sobre la gracia,
   no los minutos totales.
5. **Aplicación manual a nómina.** Registrar una incidencia solo calcula y
   guarda el monto ("pendiente"). Elena decide después, desde la ficha del
   colaborador, a qué rol de pago (quincena) aplicarlo — no hay aplicación
   automática al generar/sincronizar períodos (a diferencia de préstamos y
   descuentos recurrentes).
6. **Horario del colaborador**: catálogo editable `horarios` (mismo patrón
   que `tipos_contrato`/`servicios_descuento`), no un campo derivado de
   `departamento` ni hardcodeado en el generador de nómina.
7. **Gracia simétrica**: se asume que los 5 minutos de gracia aplican tanto
   a la llegada tarde como a la salida anticipada, salvo que Andrés indique
   lo contrario tras revisar el spec.

## Alcance

### Schema — migración `016_incidencias_horario.sql`

```sql
CREATE TABLE horarios (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  hora_entrada_semana time NOT NULL,
  hora_salida_semana time NOT NULL,
  hora_entrada_sabado time NOT NULL,
  hora_salida_sabado time NOT NULL,
  horas_jornada_semana numeric(4,2) NOT NULL,
  horas_jornada_sabado numeric(4,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO horarios
  (codigo, nombre, hora_entrada_semana, hora_salida_semana, hora_entrada_sabado, hora_salida_sabado, horas_jornada_semana, horas_jornada_sabado)
VALUES
  ('ADM', 'Administrativo', '08:30', '17:30', '10:00', '14:00', 8, 4),
  ('COMERCIAL', 'Comercial', '09:00', '17:30', '10:00', '14:00', 8, 4);

ALTER TABLE colaboradores ADD COLUMN horario text REFERENCES horarios(codigo);

INSERT INTO parametros (clave, valor) VALUES ('MINUTOS_GRACIA', '5') ON CONFLICT DO NOTHING;

CREATE TABLE incidencias_horario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  hora_entrada_real time,
  hora_salida_real time,
  minutos_tardanza int NOT NULL DEFAULT 0,
  minutos_salida_anticipada int NOT NULL DEFAULT 0,
  monto_total numeric(10,2) NOT NULL,
  notas text,
  lineas_rol_id uuid REFERENCES lineas_rol(id),
  creado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_entrada_real IS NOT NULL OR hora_salida_real IS NOT NULL)
);
CREATE INDEX idx_incidencias_horario_colaborador ON incidencias_horario(colaborador_id);

ALTER TABLE lineas_rol
  ADD COLUMN incidencia_horario_id uuid REFERENCES incidencias_horario(id);
```

### Backend

- **`server/src/lib/incidencias-horario.js`** — función pura
  `calcularIncidencia({ horario, sueldoBase, fecha, horaEntradaReal, horaSalidaReal, minutosGracia })`
  que devuelve `{ minutosTardanza, minutosSalidaAnticipada, montoTotal }`.
  Determina si `fecha` cae sábado (`Date.getUTCDay() === 6`) para elegir
  `horas_jornada_sabado` vs `horas_jornada_semana`, y las horas
  esperadas correspondientes del `horario`. Resta `minutosGracia` del
  exceso en ambos cálculos (símetrico, ver decisión 7).
- **`server/src/routes/horarios.js`** — catálogo, mismo patrón que
  `tipos-contrato.js` (GET público para autenticados, POST/PATCH solo
  ADMIN).
- **`server/src/routes/colaboradores.js`**: `PATCH /:id` agrega `horario`
  a los campos editables.
- **`server/src/routes/incidencias-horario.js`**, montado en
  `/api/colaboradores/:colaboradorId/incidencias-horario`
  (`requireRole(['ADMIN','RRHH'])`):
  - `POST /` — valida que el colaborador tenga `horario` asignado y un
    contrato con `sueldo_base` vigente en `fecha`; calcula con
    `calcularIncidencia` y guarda.
  - `GET /` — lista, más reciente primero.
  - `POST /:id/aplicar` — recibe `rol_pago_id`; valida que la incidencia
    no tenga `lineas_rol_id` ya, que `rol_pago_id` sea del mismo
    colaborador y que el período esté en `BORRADOR`; inserta en
    `lineas_rol` (`tipo_linea='DESCUENTO_HORARIO'`, `clase='DESCUENTO'`,
    `monto=incidencia.monto_total`, `incidencia_horario_id=incidencia.id`),
    guarda `lineas_rol_id` en la incidencia.
  - `DELETE /:id` — solo si `lineas_rol_id IS NULL`.

### Frontend

- `client/src/pages/Configuracion.jsx`: nueva sección para el catálogo
  `horarios` (agregar/editar horas de entrada/salida y horas de jornada
  por horario), mismo patrón que las secciones existentes.
- `client/src/pages/ColaboradorDetalle.jsx`:
  - `FichaTab`: selector "Horario" (opciones del catálogo).
  - Nueva pestaña **"Horario"**: formulario para registrar incidencia
    (fecha, hora entrada real, hora salida real — ambas opcionales, al
    menos una requerida) que muestra el desglose calculado al guardar;
    tabla de incidencias con badge Pendiente/Aplicada. Para las
    pendientes: selector de rol de pago (roles del colaborador en
    período `BORRADOR`, ya disponibles en `col.roles_pago`) + botón
    "Aplicar".

## Testing

- `server/tests/incidencias-horario-calculo.test.js`: casos unitarios de
  `calcularIncidencia` — dentro de gracia (monto 0), tardanza simple,
  salida anticipada simple, ambas el mismo día, sábado (jornada de 4h,
  tarifa distinta a la de semana).
- `server/tests/incidencias-horario.test.js`: integración — crear
  incidencia (valida colaborador sin horario o sin contrato vigente →
  400), aplicar a un rol de pago `BORRADOR` (verifica la línea en
  `lineas_rol` y que el total del rol la incluya), rechazo si ya está
  aplicada o si el período no está en `BORRADOR`, `DELETE` de una
  incidencia pendiente, permisos (solo ADMIN/RRHH).
- `npm -w client run build`.

## Fuera de alcance

- Integración con reloj biométrico o importación masiva de marcaciones.
- Aplicación automática a nómina al generar/sincronizar períodos.
- Horarios adicionales más allá de ADM/Comercial (el catálogo queda listo
  para agregarlos, pero no se precargan otros).
- Cambiar la gracia a asimétrica (solo entrada) — se deja simétrica salvo
  que se indique lo contrario al revisar este spec.
