function doPost(e) {
  const SECRET = PropertiesService.getScriptProperties().getProperty('EMAIL_RELAY_SECRET') || 'CAMBIA_ESTA_CLAVE';
  const params = e && e.parameter ? e.parameter : {};

  if (params.secret !== SECRET) {
    return json({ ok: false, error: 'bad_secret' });
  }

  const to = params.to;
  if (!to) return json({ ok: false, error: 'missing_to' });

  const appName = params.appName || 'Cuentas Hogar';
  const subject = params.subject || ('Tu código de acceso a ' + appName);
  const body = params.message || ('Tu código de acceso es: ' + params.code + '\n\nEste código vence pronto.');

  GmailApp.sendEmail(to, subject, body, { name: appName });
  return json({ ok: true });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
