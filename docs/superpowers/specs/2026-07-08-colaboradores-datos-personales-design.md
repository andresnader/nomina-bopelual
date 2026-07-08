# Colaboradores: datos personales y tipo de contrato

**Fecha**: 2026-07-08 · **Estado**: aprobado por Andrés

## Contexto

Observaciones recibidas por correo sobre el módulo de colaboradores piden
incorporar: fecha de ingreso, fecha de cumpleaños, correo electrónico, número
de cargas familiares, estado civil, tipo de contrato, sexo y dirección de
domicilio.

Al revisar el código, `fecha_ingreso`, `email` y `cargas_personales` (cargas
familiares) ya existen en BD, API y UI. Este spec cubre únicamente los cinco
campos que faltan: **fecha de cumpleaños, estado civil, sexo, dirección de
domicilio y tipo de contrato**.

Este es el primero de tres sub-proyectos derivados del correo. Los otros dos
(fecha de vencimiento automática de descuentos recurrentes, y reporte de
décimos/fondos de reserva desglosado por período) se especifican por separado.

## Alcance

### Schema — migración `009_datos_personales.sql`

```sql
ALTER TABLE colaboradores
  ADD COLUMN fecha_nacimiento date,
  ADD COLUMN sexo text CHECK (sexo IN ('M','F')),
  ADD COLUMN estado_civil text CHECK (estado_civil IN ('SOLTERO','CASADO','DIVORCIADO','VIUDO','UNION_LIBRE')),
  ADD COLUMN direccion text;

ALTER TABLE contratos
  ADD COLUMN tipo_contrato text CHECK (tipo_contrato IN ('INDEFINIDO','PLAZO_FIJO','PASANTIA','PRESTACION_SERVICIOS'));
```

Todas las columnas son nullable — no rompen colaboradores/contratos
existentes. `tipo_contrato` vive en `contratos` (no en `colaboradores`)
porque puede cambiar al renovar o convertir un contrato (ej. de plazo fijo a
indefinido), igual que ya pasa con `sueldo_base`.

### Backend

- `PATCH /colaboradores/:id` (`server/src/routes/colaboradores.js`): agregar
  `fecha_nacimiento`, `sexo`, `estado_civil`, `direccion` a la lista de campos
  actualizables, mismo patrón que `cargas_personales`. Sin validación aplicativa
  extra — el CHECK de BD rechaza valores fuera del enum.
  **Hallazgo al revisar el código**: esta ruta hoy no tiene try/catch, así que
  una violación de CHECK (ya posible hoy con `tipo_cuenta`, y ahora también con
  `sexo`/`estado_civil`) no responde 400 — la promesa queda sin manejar y la
  request nunca recibe respuesta. Como esta es la ruta exacta que estoy
  modificando, agrego un try/catch que devuelva 400 con el mensaje del error
  de Postgres (mismo patrón que `POST /descuentos`).
- `POST /colaboradores/:id/contratos` (`server/src/routes/colaboradores.js` o
  donde viva el router anidado de contratos): agregar `tipo_contrato` opcional
  al INSERT.
- Cero cambios en `services/periodos.js`, `calculo.js` ni en el generador de
  TXT — son campos puramente informativos, no entran al cálculo de nómina ni
  al archivo de banco.

### Frontend

- `client/src/pages/ColaboradorDetalle.jsx` (ficha, pestaña principal):
  agregar los 4 campos al formulario editable — fecha_nacimiento (`input
  type="date"`), sexo y estado_civil (`select`), dirección (`input text`).
- `ContratosTab` (mismo archivo): agregar `select` de tipo_contrato al
  formulario de alta de contrato, y una columna en la tabla de historial de
  contratos.
- `client/src/pages/Colaboradores.jsx` (listado + alta rápida): **sin
  cambios**. Ese formulario es para alta rápida (nombre, cédula, tipo, fecha
  de ingreso); los datos personales se completan después en la ficha, igual
  que ya pasa con cargas_personales y datos bancarios.

## Testing

- `server/tests/colaboradores.test.js`: test de PATCH aceptando los 4 campos
  nuevos y persistiéndolos.
- Test de POST contratos con `tipo_contrato`.
- Test de rechazo de un valor fuera del enum (ej. `sexo: 'X'`) — confirma que
  el CHECK de BD está activo y que la ruta responde 400 en vez de colgarse.
- `npm -w client run build` para confirmar que el JSX compila.

## Fuera de alcance

- No se tocan reportes ni cálculo de nómina.
- No se agrega historial de cambios de estos campos (solo el valor actual).
- No se valida formato de dirección (texto libre).
