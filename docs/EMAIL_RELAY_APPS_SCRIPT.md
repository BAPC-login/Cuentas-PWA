# Email relay gratis con Google Apps Script

Este proyecto puede enviar códigos de acceso sin comprar dominio usando GmailApp desde Google Apps Script.

## Objetivo

- Mantener la app gratis.
- No depender de dominio propio.
- Enviar códigos temporales desde una cuenta Gmail del owner.
- Seguir usando Cloudflare Worker + D1 como backend principal.

## Archivos

- `apps-script/email-relay.gs`: código que debes pegar en Google Apps Script.
- Worker: enviará `{ to, code, secret }` al Web App de Apps Script.

## Configuración en Google Apps Script

1. Entra a script.google.com.
2. Crea un proyecto nuevo.
3. Pega el contenido de `apps-script/email-relay.gs`.
4. Cambia:

```js
const RELAY_SECRET = 'CAMBIA_ESTA_CLAVE_LARGA';
```

por una clave larga propia. Ejemplo conceptual: una frase larga con números y símbolos. No la subas a GitHub.

5. Implementa como Web App:
   - Ejecutar como: tú.
   - Acceso: cualquiera con el enlace.
6. Autoriza los permisos de Gmail.
7. Copia la URL final que termina en `/exec`.

## Configuración en Cloudflare Worker

En PowerShell, dentro del repo:

```powershell
npx wrangler secret put EMAIL_RELAY_URL
```

Pega la URL `/exec` de Apps Script.

Luego:

```powershell
npx wrangler secret put EMAIL_RELAY_SECRET
```

Pega la misma clave que pusiste en `RELAY_SECRET`.

Finalmente:

```powershell
npx wrangler deploy
```

## Comportamiento esperado

- Si `EMAIL_RELAY_URL` y `EMAIL_RELAY_SECRET` existen, el Worker envía el código usando GmailApp.
- Si falla el relay, el Worker puede devolver un error claro.
- Resend queda opcional, no obligatorio.

## Nota

Para uso personal, las cuotas gratuitas de GmailApp deberían ser suficientes. Este relay no está pensado para una app pública de alto volumen.
