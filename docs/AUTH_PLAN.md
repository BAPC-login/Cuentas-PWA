# Flujo de sesiones persistentes

Objetivo:

- El owner crea usuarios por correo.
- Cada usuario activa su cuenta desde la app.
- La sesión queda abierta en el dispositivo hasta que el usuario cierre sesión o el owner revoque el acceso.

Estado actual esperado:

- Demo local en navegador.
- Sin envío real de correos todavía.
- Próxima etapa: backend con Cloudflare Worker, D1 y proveedor de email.

Modelo futuro:

- users: email, name, role, status.
- login_codes: email, code_hash, expires_at, used_at.
- sessions: user_id, device_id, revoked_at.
- movements: debtor_id, creditor_id, amount, status.
