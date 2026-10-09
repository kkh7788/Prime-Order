// CloudBase injects the authenticated caller identity into the function runtime.
// Never derive authorization from event._token, event.uid, or another client field.
// https://docs.cloudbase.net/api-reference/server/node-sdk/auth#getuserinfo
const { getApp } = require('./db');

async function requireAdmin(rdb) {
  try {
    // Resolve for every invocation: never cache a caller identity in a warm function.
    const user = await getApp().auth().getUserInfo();
    const uid = user && user.uid;
    if (typeof uid !== 'string' || !uid.trim()) return null;

    const { data, error } = await rdb.from('vibe_admins')
      .select('id').eq('web_uid', uid).limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return uid;
  } catch (_) {
    // Authentication/permission service failures must never grant access.
    console.warn('[admin-auth] unable to verify administrator');
    return null;
  }
}

module.exports = { requireAdmin };
