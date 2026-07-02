/**
 * Cuentas Hogar - Email Relay gratuito con GmailApp
 *
 * 1. Crea un proyecto en Google Apps Script.
 * 2. Pega este archivo completo.
 * 3. Cambia RELAY_SECRET por una clave larga propia.
 * 4. Implementa como Web App:
 *    - Ejecutar como: tú
 *    - Acceso: cualquiera con el enlace
 * 5. Copia la URL /exec y guárdala en Cloudflare como EMAIL_RELAY_URL.
 * 6. Guarda la misma clave en Cloudflare como EMAIL_RELAY_SECRET.
 */

const RELAY_SECRET = 'CAMBIA_ESTA_CLAVE_LARGA';
const APP_NAME = 'Cuentas Hogar';
const REPLY_TO = '';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');

    if (payload.secret !== RELAY_SECRET) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }

    const to = String(payload.to || '').trim().toLowerCase();
    const code = String(payload.code || '').trim();
    const appName = String(payload.appName || APP_NAME).trim();

    if (!isValidEmail(to)) {
      return jsonResponse({ ok: false, error: 'invalid_email' }, 400);
    }

    if (!/^\d{6}$/.test(code)) {
      return jsonResponse({ ok: false, error: 'invalid_code' }, 400);
    }

    const subject = `Tu código de acceso a ${appName}`;
    const body = `Tu código de acceso a ${appName} es: ${code}\n\nEste código vence pronto.\n\nSi no pediste este acceso, ignora este correo.`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2>${escapeHtml(appName)}</h2>
        <p>Tu código de acceso es:</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 16px 20px; background: #f3f4f6; border-radius: 12px; display: inline-block;">${code}</div>
        <p>Este código vence pronto.</p>
        <p>Si no pediste este acceso, ignora este correo.</p>
      </div>
    `;

    const options = {
      name: appName,
      htmlBody,
    };

    if (REPLY_TO) options.replyTo = REPLY_TO;

    GmailApp.sendEmail(to, subject, body, options);

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) }, 500);
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function jsonResponse(data, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...data, status: status || 200 }))
    .setMimeType(ContentService.MimeType.JSON);
}
