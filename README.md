# Cuentas Hogar PWA

Primera versión de una app moderna para llevar cuentas del hogar entre usuarios.

## Frontend publicado

`https://bapc-login.github.io/Cuentas-PWA/`

## Qué incluye esta versión

- PWA instalable y usable offline.
- Interfaz responsive para celular y computador.
- Usuarios personalizados administrados por el owner.
- Vista por usuario: la misma cuenta se expresa distinto según quién esté mirando.
- Registro de movimientos con deudor, acreedor, monto, fecha y detalle.
- Adjuntar comprobante de pago como imagen comprimida.
- Marcar movimientos como pendientes o pagados.
- Resumen de saldos y relaciones entre usuarios.
- Exportar/importar respaldo JSON.
- Soporte offline mediante service worker.

## Backend preparado

Se agregó una base de API con Cloudflare Workers y D1 en `backend/src/index.js`.

Endpoints incluidos:

- `GET /health`
- `POST /auth/request-code`
- `POST /auth/verify-code`
- `POST /auth/logout`
- `GET /me`
- `GET /owner/users`
- `POST /owner/users`
- `PATCH /owner/users/:id/revoke`
- `PATCH /owner/users/:id/reactivate`

La sesión queda persistente hasta logout o revocación del owner.

## Cómo desplegar backend después

1. Crear D1 en Cloudflare.
2. Copiar `wrangler.toml.example` como `wrangler.toml`.
3. Pegar el `database_id` real.
4. Ejecutar migraciones con Wrangler.
5. Desplegar el Worker.
6. Conectar el frontend a la URL del Worker.

## Pendiente

- Enviar códigos por correo real con Resend u otro proveedor.
- Mover movimientos y comprobantes desde localStorage a D1.
- Conectar la UI de login al backend real.
