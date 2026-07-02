# Cuentas Hogar PWA

App personal moderna para llevar cuentas del hogar entre usuarios.

## Frontend publicado

`https://bapc-login.github.io/Cuentas-PWA/`

## Estado actual

- PWA publicada en GitHub Pages.
- Backend en Cloudflare Workers.
- D1 configurado para usuarios, códigos, sesiones y movimientos futuros.
- Login por correo + código temporal.
- Sesiones persistentes hasta logout o revocación del owner.
- Owner puede crear usuarios por correo, revocar y reactivar.
- Resend es opcional.
- Para uso personal, se agregó relay gratuito con Google Apps Script + GmailApp.

## Qué incluye esta versión

- PWA instalable y usable offline.
- Interfaz responsive para celular y computador.
- Usuarios personalizados administrados por el owner.
- Vista por usuario: la misma cuenta se expresa distinto según quién esté mirando.
- Registro local de movimientos con deudor, acreedor, monto, fecha y detalle.
- Adjuntar comprobante de pago como imagen comprimida.
- Marcar movimientos como pendientes o pagados.
- Resumen de saldos y relaciones entre usuarios.
- Exportar/importar respaldo JSON.

## Backend

API principal en `backend/src/index.js`.

Endpoints incluidos:

- `GET /health`
- `POST /auth/request-code`
- `POST /auth/verify-code`
- `POST /auth/logout`
- `GET /me`
- `PATCH /me/profile`
- `GET /owner/users`
- `POST /owner/users`
- `PATCH /owner/users/:id/revoke`
- `PATCH /owner/users/:id/reactivate`

## Email gratis con GmailApp

Ver `docs/EMAIL_RELAY_APPS_SCRIPT.md`.

Resumen:

1. Crear Google Apps Script.
2. Pegar `apps-script/email-relay.gs`.
3. Definir una clave secreta.
4. Publicar como Web App.
5. Guardar URL y secreto en Cloudflare:

```powershell
npx wrangler secret put EMAIL_RELAY_URL
npx wrangler secret put EMAIL_RELAY_SECRET
npx wrangler deploy
```

## Pendiente

- Persistir movimientos en D1 para sincronizar entre celulares.
- Mejorar la ventana de perfil en el frontend.
- Mejorar manejo visual de errores.
- Agregar edición de perfil y nombre visible desde el panel.
