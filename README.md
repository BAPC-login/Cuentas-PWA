# Cuentas Hogar PWA

Primera versión de una app moderna para llevar cuentas del hogar entre usuarios.

## Qué incluye esta versión

- PWA instalable y usable offline.
- Interfaz responsive para celular y computador.
- Usuarios iniciales: Benjamín, María e Iriannys.
- Vista por usuario: la misma cuenta se expresa distinto según quién esté mirando.
  - Ejemplo: si María debe $50.000 a Benjamín, en la vista de Benjamín aparece “María te debe $50.000”.
  - En la vista de María aparece “Le debes a Benjamín $50.000”.
- Registro de movimientos con deudor, acreedor, monto, fecha y detalle.
- Adjuntar comprobante de pago como imagen comprimida.
- Marcar movimientos como pendientes o pagados.
- Resumen de saldos y relaciones entre usuarios.
- Exportar/importar respaldo JSON.
- Soporte offline mediante service worker.

## Cómo publicarla en GitHub Pages

El repositorio ya incluye un workflow en `.github/workflows/pages.yml`.

Para activarlo:

1. Ir a **Settings** del repositorio.
2. Entrar a **Pages**.
3. En **Build and deployment**, seleccionar **GitHub Actions**.
4. Guardar.
5. Volver a **Actions** y ejecutar o esperar el workflow `Deploy static PWA to GitHub Pages`.

Cuando termine, GitHub mostrará el link público o privado según la configuración del repositorio.

## Limitación actual

Esta versión guarda datos en el navegador con `localStorage`. Sirve para probar la experiencia, instalar la PWA y usarla sin servidor, pero todavía no sincroniza datos entre celulares.

## Próxima etapa recomendada

Conectar una base compartida para que todos los usuarios vean la misma información:

- Opción simple: Google Sheets como base temporal.
- Opción más robusta: Supabase o Firebase.
- Después: lectura automática de comprobantes con OCR/IA.
