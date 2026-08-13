# Nómina BOPELUAL

## Cómo nació la aplicación y qué problema resuelve

**Documento narrativo · BOPELUAL S.A. y CONCESIONARIA CARROS-YA S.A. · Guayaquil, Ecuador**

---

## 1. El problema: la nómina a mano en Excel

Antes de este sistema, el pago a los colaboradores de BOPELUAL S.A. y de su empresa hermana CONCESIONARIA CARROS-YA S.A. se gestionaba de forma **100% manual en Excel**, y era Recursos Humanos quien llevaba ese archivo a mano, quincena a quincena.

Era un proceso con estas características:

| Aspecto | Cómo se hacía |
|---|---|
| Un archivo por quincena y por empresa | BOPELUAL S.A. y CARROS-YA S.A. tenían roles de pago separados |
| Dos hojas por archivo | Hoja 1: empleados afiliados al IESS · Hoja 2: servicios profesionales (externos) |
| Cálculos a mano | Sueldos, anticipos, alimentación y **una lista larga de descuentos** escritos fila por fila |
| Bancos a mano | Se escribían números de cuenta y códigos de banco para armar el TXT de pago masivo del Banco Pichincha |

### El dolor principal: los descuentos

Los descuentos eran el punto más delicado. RRHH tenía que aplicar a cada colaborador, mes a mes, una lista enorme de conceptos **sin ninguna ayuda del sistema**:

`IESS personal (9.45%) · Anticipo de la 1ra quincena · COMISARIATO · DESCUENTO · HIPOTECARIO · QUIROGRAFARIO · LENTES · MEC · NEC · PRESTAMO · SALUDSA · PENSION ALIMENTICIA · CUOTA PLAN · PLAN VEHICULAR · UNIFORMES · RETENCION · SEGURO`

Cada uno de esos conceptos se escribía a mano, con su monto, contra el sueldo de cada persona. Cualquier equivocación de dedo se convertía directamente en un descuento mal aplicado en el sueldo de un colaborador.

### La evidencia de que el proceso fallaba

Al revisar los archivos reales del proceso manual se encontraron **errores concretos** que confirmaban el riesgo:

- La descripción `PGO 1RA 15NA` (pago de primera quincena) aparecía por error en un archivo de segunda quincena.
- El monto de un colaborador en el TXT del banco (277.15) **no coincidía** con el monto del rol de pagos (287.50): la persona cobró menos de lo que el rol decía.

Ese segundo caso es exactamente el tipo de problema que este sistema elimina: **la diferencia entre lo que se calcula y lo que se paga**.

A eso se sumaban otros problemas de fondo:

- **Sin historial auditable**: no se podía reconstruir de dónde salía un descuento de hace tres meses.
- **Sin beneficios de ley confiables**: décimos, fondos de reserva y aportes IESS se calculaban a mano, con alto riesgo de error.
- **Sin comprobantes por colaborador**: cada trabajador no tenía un rol de pago claro que consultar.
- **Pago bancario propenso a errores**: el TXT de pago masivo se armaba manualmente, campo por campo.

---

## 2. La decisión: construir un sistema propio

En lugar de parchar el Excel, se decidió **construir una aplicación web dedicada** que reemplazara el manejo manual por un sistema con:

- Cálculo automático de la nómina quincenal.
- Historial auditable: cada ingreso y cada descuento queda registrado línea por línea.
- Cálculo automático de los beneficios de ley ecuatorianos.
- Generación automática del TXT de pago bancario.
- Comprobantes para cada colaborador.
- Roles y permisos: cada persona ve solo lo que le corresponde.

### Cómo nació (el proceso de diseño)

El proyecto comenzó el **2 de julio de 2026** con un ejercicio de diseño: se hizo una ronda de preguntas de definición (7 preguntas de contexto), y de ahí salió una **especificación de diseño aprobada** que definió las decisiones canónicas del sistema.

Las decisiones más importantes que se tomaron al inicio:

| Decisión | Razón |
|---|---|
| **App y base de datos independientes** | La nómina es información sensible; no debe mezclarse con otros dominios (casos legales) |
| **Nómina quincenal** | 1ra quincena = anticipo (porcentaje configurable) · 2da quincena = liquidación con descuentos y beneficios |
| **Modelo de "períodos con líneas de detalle"** | Todo ingreso o descuento es una fila auditada; el neto se deriva de las líneas, no se escribe plano |
| **4 roles de acceso** | ADMIN · RRHH · GERENCIA · COLABORADOR |
| **Ciclo de vida del período** | BORRADOR → APROBADO → CERRADO (cerrado es irreversible) |
| **Beneficios de ley completos** | Décimo tercero, décimo cuarto, fondos de reserva (8.33%) e IESS (9.45%) calculados automáticamente |

---

## 3. La creación, paso a paso

### 3.1 El arranque (Fase 1)

Se armó un monorepo con dos partes: `server` (Node.js + Express + PostgreSQL) y `client` (React + Vite + Tailwind CSS), con autenticación mediante **Google SSO restringida al dominio del Workspace de BOPELUAL**.

Los primeros desarrollos, en orden:

1. **Motor de cálculo puro** — funciones para IESS, provisiones, retención, préstamos y totales, con pruebas unitarias desde el primer día.
2. **Esquema de base de datos** — migraciones idempotentes que corren solas al arrancar el servidor.
3. **Autenticación y roles** — Google SSO con middleware de roles y acceso a los propios datos.
4. **Ciclo de vida del período** — el servicio que genera, recalcula y transiciona los períodos (BORRADOR → APROBADO → CERRADO).
5. **Colaboradores y contratos** — CRUD completo con historial de sueldos.
6. **Préstamos y facturas de proveedor** — amortización automática y retención del 10% para externos.
7. **Reportes CSV y provisiones** — acumulados contables al cerrar el período.
8. **Cliente completo** — las 10 pantallas principales: Dashboard, Colaboradores, Colaborador Detalle, Períodos, Período Detalle, Rol de Pago, Proveedores/Facturas, Préstamos, Reportes y Configuración.

### 3.2 La prueba de fuego: importar la nómina real de junio 2026

El momento clave de validación fue la **importación histórica de la nómina de junio de 2026**: se tomaron los archivos Excel reales del proceso manual y se importaron a la base de datos.

El resultado fue contundente:

- **29 colaboradores** (15 IESS + 14 externos), 29 contratos, 2 períodos, 55 roles de pago, 243 líneas y 13 provisiones.
- Los netos cuadraron **al 100% con los Excel originales** (con tolerancia de 2 centavos y cero advertencias).
- La validación cruza cada fila contra el neto del Excel y **aborta si hay diferencias**.

Esto demostró que el sistema era capaz de reproducir exactamente el proceso manual, pero ahora de forma automática y controlada.

### 3.3 El pago bancario automático

Se implementó la **generación automática del TXT Cash Management del Banco Pichincha**: el mismo formato de pago masivo que antes se armaba a mano, ahora se genera desde los roles de pago aprobados, agrupado por empresa y por grupo (ADMIN, COMERCIAL, SERVICIOS PROFESIONALES), con los códigos de banco correctos y los montos en centavos sin error.

### 3.4 Fase 2: Talento Humano y portal del colaborador

La aplicación se expandió a la gestión integral de personas:

- **Contratos**: emisión de contratos (productivo, servicios profesionales, comisionista) y documentos legales en Word (acuerdos de confidencialidad, consentimientos).
- **Ausencias e incidencias de horario**: control de asistencia y horarios.
- **Descuentos recurrentes**: con fecha de vencimiento y desactivación automática al agotar cuotas.
- **Anticipo configurable por colaborador**: el porcentaje de la 1ra quincena se define por persona, no globalmente.
- **Portal del colaborador**: cada trabajador ve sus propios roles de pago y su historial.
- **Documentos y evaluaciones**: historial de documentos (hasta 5 MB) y evaluaciones por colaborador.

### 3.5 Evolución continua (150 commits)

El sistema ha seguido madurando con mejoras de calidad de vida (notificaciones toast y modales que reemplazaron los popups del navegador), rediseño responsive para móvil, aprobación por grupo, períodos mensuales con clasificación cruzada (tipo × clasificación), totales por empresa, y un set de **89/89 pruebas automatizadas** que garantizan que los cálculos sigan correctos con cada cambio.

---

## 4. Cómo resuelve el problema de los descuentos

El corazón del cambio está en **cómo se aplican ahora los descuentos**. Lo que antes era una fila escrita a mano en un Excel, ahora es:

### 4.1 Todo descuento es una línea auditable

Cada rol de pago se compone de `líneas` (`lineas_rol`): una fila por ingreso y una fila por descuento, con su tipo (en mayúsculas: `IESS_PERSONAL`, `COMISARIATO`, `CUOTA_PRESTAMO`, `LENTES`, etc.), su clase (INGRESO o DESCUENTO), su monto y su descripción. El neto **se deriva de la suma de líneas**, nunca se escribe a mano.

### 4.2 Catálogo de descuentos configurable

Existe un catálogo de **servicios de descuento** que el ADMIN administra (alta, edición, activación/desactivación). RRHH ya no "inventa" un descuento en el Excel: usa los conceptos definidos, con nombre y reglas claras.

### 4.3 Descuentos automáticos que se calculan solos

- **Aporte IESS personal (9.45%)** se calcula automáticamente del sueldo.
- **Cuotas de préstamos y anticipos** se descuentan solas período a período, y el saldo se actualiza; al saldarse, dejan de aplicarse.
- **Descuentos recurrentes** (comisariato, lentes, MEC, NEC, cuota plan, etc.) se configuran una vez con su cuota y su fecha de vencimiento, y el sistema los aplica hasta que terminan.
- **Beneficios de ley**: décimo tercero, décimo cuarto y fondos de reserva se provisionan mensualmente y se acumulan para el pago correspondiente.

### 4.4 Control de flujo: nada se paga por accidente

- El período nace en **BORRADOR** (solo ahí se puede editar).
- RRHH **aprueba** y gerencia revisa los totales.
- Se **cierra** de forma **irreversible**: una nómina pagada no se puede modificar, garantizando integridad contable.

### 4.5 Transparencia para el colaborador

Cada colaborador entra al portal, ve su **comprobante de pago** con todos sus ingresos y descuentos desglosados, y su historial. Ya no hay "descuentos sorpresa": todo está a la vista y explicado.

### 4.6 El pago bancario sin diferencias

El TXT de pago se genera **desde los mismos datos aprobados**, lo que elimina por completo la clase de error que se detectó en el proceso manual (un monto distinto entre el rol y el banco). Lo que se aprueba es exactamente lo que se paga.

---

## 5. La arquitectura técnica en una página

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + Tailwind CSS + React Router + lucide-react |
| Backend | Node.js + Express (API REST en `/api`) |
| Base de datos | PostgreSQL (Railway, proyecto dedicado) |
| Autenticación | Google SSO, dominio del Workspace de BOPELUAL |
| Despliegue | Railway (migraciones automáticas al arrancar) |
| Pruebas | Vitest + Supertest (89/89) |
| Cálculos | Módulo puro con manejo de decimales a 2 posiciones (evita errores de flotantes) |

**Roles del sistema:**

| Rol | Qué puede hacer |
|---|---|
| ADMIN | Configuración completa: usuarios, catálogos, parámetros IESS |
| RRHH | Crear/editar períodos, aprobar y cerrar nómina, gestionar colaboradores |
| GERENCIA | Dashboard y reportes de solo lectura |
| COLABORADOR | Ver únicamente sus propios roles de pago e historial |

**Ciclo de vida de una quincena:**

```
RRHH crea período (BORRADOR)
  └─ El sistema genera los roles de pago de todos los colaboradores activos
     └─ Calcula automáticamente: sueldo, anticipo, IESS, provisiones,
        cuotas de préstamos y descuentos recurrentes
        └─ RRHH revisa y ajusta (solo en BORRADOR)
           └─ RRHH aprueba (APROBADO)
              └─ Gerencia revisa totales
                 └─ Se cierra (CERRADO) — irreversible
                    └─ Se genera el TXT de pago bancario
                       └─ Los colaboradores ven sus comprobantes
```

---

## 6. Resultados

| Antes (Excel a mano) | Después (Nómina BOPELUAL) |
|---|---|
| Descuentos escritos fila por fila | Descuentos automáticos y auditables |
| Errores entre el rol y el banco | El pago sale de los mismos datos aprobados |
| Sin historial | Cada quincena es reconstruible línea por línea |
| Beneficios de ley a mano | Cálculo automático (IESS, décimos, fondos) |
| Sin comprobantes | Portal del colaborador con roles de pago |
| Sin permisos | Acceso por rol: cada uno ve solo lo suyo |
| Nómina de junio 2026 cuadró al 100% con el sistema | Proceso validado contra datos reales |

---

## 7. Conclusión

La nómina de BOPELUAL pasó de ser un **Excel llevado a mano por Recursos Humanos, con descuentos aplicados uno a uno y errores que afectaban directamente el sueldo de los colaboradores**, a ser un **sistema web con cálculo automático, control de flujo, historial auditable y pago bancario sin discrepancias**.

El punto más importante: **lo que antes dependía de la memoria y del cuidado humano — la larga lista de descuentos — ahora es parte del sistema**, se calcula solo, se revisa antes de pagar y queda registrado para siempre. Esa es la diferencia entre "descontar a mano" y "pagar con orden".
