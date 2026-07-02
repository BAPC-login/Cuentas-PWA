# Roadmap Cuentas Hogar

## Estado actual

- PWA publicada en GitHub Pages.
- Worker en Cloudflare.
- D1 activo.
- Login por correo con codigo temporal.
- Envio gratis por GmailApp usando Apps Script como relay.
- Usuarios reales creados por el owner.
- Sesiones persistentes hasta logout o revocacion.

## Regla de usuarios

- El owner crea correos autorizados.
- Cualquier usuario autorizado puede entrar con correo + codigo.
- El owner decide que usuarios participan en el hogar.
- Un usuario revocado no puede pedir codigo ni mantener sesion.
- Los usuarios no deben crearse solos desde el login publico.

## UX de perfil

Objetivo:

- El login debe pedir solo correo y codigo.
- Si el usuario aun no tiene nombre, luego de validar el codigo se abre un modal obligatorio.
- Si el usuario ya tiene nombre, entra directo.
- El usuario puede editar su nombre desde Mi Perfil.

Implementacion pendiente:

- Integrar `src/profile-modal.js` en el frontend principal o refactorizar `src/app.js` por modulos.
- Eliminar el campo `Nombre si es primera vez` del formulario de login.
- Agregar boton `Mi perfil` en la barra lateral.

## Sincronizacion fuerte

Proxima etapa fuerte de la app:

1. Persistir movimientos en D1.
2. Reemplazar movimientos locales por llamadas API.
3. Mantener cache local solo como respaldo offline.
4. Permitir que cualquier usuario autorizado cree una cuenta.
5. Permitir que el owner/admin confirme participantes del hogar.
6. Sincronizar movimientos entre celulares.

## Comprobantes por correo

Objetivo personal:

- El owner puede reenviar o recibir comprobantes en su Gmail.
- ChatGPT puede leer tu correo cuando tu lo pidas dentro de esta conversacion.
- La PWA no hereda automaticamente el acceso de ChatGPT a Gmail.
- Para que la PWA lea Gmail sola se necesita OAuth/Apps Script adicional.

Camino gratis recomendado:

1. Crear un segundo Apps Script llamado `Cuentas Hogar - Gmail Ingest`.
2. El script busca correos con adjuntos o asuntos tipo comprobante, transferencia, pago, boleta.
3. Extrae metadatos: remitente, asunto, fecha, texto, adjuntos.
4. Envia candidatos al Worker con un secreto.
5. La PWA muestra una bandeja `Pendientes de aprobacion`.
6. El owner aprueba, asigna participantes y crea el movimiento definitivo.

## Seguridad

- No guardar secretos en GitHub.
- Secrets en Cloudflare: EMAIL_RELAY_URL, EMAIL_RELAY_SECRET.
- Para Gmail ingest futuro: GMAIL_INGEST_SECRET.
- El acceso a Gmail debe quedar bajo Apps Script ejecutado por el owner.
