// Order timestamps are stored in UTC by vibe_createOrder.
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;
function isExpired(createdAt, now = Date.now()) {
  const text = String(createdAt || '');
  const timestamp = createdAt instanceof Date ? createdAt.getTime()
    : Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:/.test(text) ? text.replace(' ', 'T') + 'Z' : text);
  // Invalid timestamps must never allow a payment attempt.
  return !Number.isFinite(timestamp) || now >= timestamp + PAYMENT_WINDOW_MS;
}
function sqlTime(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
async function cancelExpired(rdb, now = Date.now()) {
  // One conditional update: retries are safe and already-paid orders are excluded.
  const { error } = await rdb.from('vibe_orders')
    .update({ status: 'cancelled', updated_at: sqlTime(now) })
    .eq('status', 'pending_payment')
    .lte('created_at', sqlTime(now - PAYMENT_WINDOW_MS));
  if (error) throw new Error(error.message || String(error));
}
module.exports = { PAYMENT_WINDOW_MS, isExpired, cancelExpired };
