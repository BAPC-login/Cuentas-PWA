export function normalizeMonthLock(value) {
  const raw = String(value || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7);
}

export function monthClosedPayload(month) {
  return {
    error: 'month_closed',
    message: `El mes ${month} está cerrado. El owner debe reabrirlo antes de modificar gastos o pagos de ese mes.`,
    month,
  };
}

export async function isMonthClosed(env, month) {
  const safeMonth = normalizeMonthLock(month);
  const row = await env.DB.prepare('SELECT month FROM month_closures WHERE month = ? LIMIT 1').bind(safeMonth).first();
  return Boolean(row);
}

export async function assertMonthOpen(env, month) {
  const safeMonth = normalizeMonthLock(month);
  if (await isMonthClosed(env, safeMonth)) return { ...monthClosedPayload(safeMonth), status: 423 };
  return null;
}

export async function firstClosedMonth(env, months) {
  for (const month of [...new Set((months || []).filter(Boolean).map(normalizeMonthLock))]) {
    if (await isMonthClosed(env, month)) return month;
  }
  return null;
}
