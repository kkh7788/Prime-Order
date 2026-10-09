const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.SECURITY_TEST_ROOT || path.resolve(__dirname, '../..');
const fallback = process.env.SECURITY_TEST_FALLBACK;
function read(relative) {
  const filename = path.join(root, relative);
  return fs.readFileSync(fs.existsSync(filename) ? filename : path.join(fallback, relative), 'utf8');
}
function loadFunction(name, state = {}) {
  const trace = { tables: [], writes: [], adminUids: [], wxCalls: 0 };
  const rdb = { from(table) {
    trace.tables.push(table);
    let queriedUid;
    const q = {
      select() { return q; },
      eq(key, value) { if (table === 'vibe_admins' && key === 'web_uid') { queriedUid = value; trace.adminUids.push(value); } return q; },
      neq() { return q; }, gte() { return q; }, limit() { return q; }, order() { return q; }, range() { return q; }, in() { return q; },
      insert(value) { trace.writes.push({ table, value }); return q; },
      update(value) { trace.writes.push({ table, value }); return q; },
      then(resolve, reject) {
        if (table === 'vibe_admins' && state.adminThrows) return Promise.reject(new Error('lookup failed')).then(resolve, reject);
        const result = table === 'vibe_admins'
          ? { data: queriedUid === 'real-admin' ? [{ id: 1 }] : [], error: state.adminError ? { message: 'unavailable' } : null }
          : { data: table === 'vibe_orders' ? state.orders || [] : [], count: 0 };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  } };
  const app = { rdb: () => rdb, auth: () => ({ getUserInfo() {
    if (state.authThrows) throw new Error('authentication unavailable');
    return { uid: state.uid };
  } }) };
  const cloud = { init() {}, getWXContext: () => ({ OPENID: state.openid }), callFunction() { trace.wxCalls++; throw new Error('Unexpected cloud call'); } };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const mod = { exports: {} }; cache.set(relative, mod);
    const localRequire = spec => {
      if (spec === './db') return { getApp: () => app };
      if (spec === 'wx-server-sdk') return cloud;
      if (spec.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), spec)) + (path.extname(spec) ? '' : '.js'));
      return require(spec);
    };
    vm.runInNewContext(read(relative), { module: mod, exports: mod.exports, require: localRequire, process: { env: {} }, console: { warn() {}, error() {}, log() {} }, Buffer, setTimeout, clearTimeout, URL }, { filename: relative });
    return mod.exports;
  }
  return { main: load(`cloudfunctions/${name}/index.js`).main, trace };
}
const webFunctions = ['vibe_web_catalog', 'vibe_web_orders', 'vibe_web_shipping', 'vibe_web_stats'];
const forged = `unsigned.${Buffer.from(JSON.stringify({ sub: 'real-admin' })).toString('base64url')}.invalid`;
const payload = { action: 'list', type: 'categories', _token: forged, uid: 'real-admin', web_uid: 'real-admin' };
for (const name of webFunctions) {
  test(`${name}: genuine administrator can read without a body token`, async () => {
    const { main, trace } = loadFunction(name, { uid: 'real-admin' });
    const result = await main({ action: 'list', type: 'categories' });
    assert.equal(result.success, true);
    assert.deepEqual(trace.adminUids, ['real-admin']);
    assert.equal(trace.writes.length, 0);
  });
  for (const [label, state] of [
    ['missing platform identity with forged admin token', {}],
    ['ordinary user with forged admin token', { uid: 'ordinary-user' }],
    ['authentication failure', { authThrows: true }],
    ['permission lookup returns error', { uid: 'real-admin', adminError: true }],
    ['permission lookup throws', { uid: 'real-admin', adminThrows: true }],
    ['invalid identity type', { uid: { sub: 'real-admin' } }],
  ]) {
    test(`${name}: rejects ${label}`, async () => {
      const { main, trace } = loadFunction(name, state);
      const result = await main(payload);
      assert.equal(result.success, false);
      assert.equal(result.error, 'FORBIDDEN');
      assert.ok(trace.tables.every(t => t === 'vibe_admins'));
      assert.equal(trace.writes.length, 0);
    });
  }
  test(`${name}: warm invocation never reuses the previous administrator`, async () => {
    const state = { uid: 'real-admin' };
    const { main } = loadFunction(name, state);
    assert.equal((await main({ action: 'list', type: 'categories' })).success, true);
    state.uid = 'ordinary-user';
    assert.equal((await main(payload)).error, 'FORBIDDEN');
  });
}
for (const name of ['vibe_createOrder', 'vibe_wallet']) {
  test(`${name}: test identity cannot impersonate a WeChat caller`, async () => {
    const { main, trace } = loadFunction(name);
    const result = await main({ _testOpenid: 'someone-else', actionType: 'GET_WALLET', cartItems: [{ skuId: 'test', quantity: 1 }] });
    assert.equal(result.success, false);
    assert.equal(trace.tables.length, 0);
  });
  test(`${name}: real WeChat caller still reaches normal input validation`, async () => {
    const { main } = loadFunction(name, { openid: 'real-wechat-user' });
    const result = await main({ _testOpenid: 'someone-else', actionType: 'INVALID' });
    assert.equal(result.error, name === 'vibe_createOrder' ? 'Empty cart' : 'INVALID_ACTION');
  });
}
test('client cannot mark an order paid, even as its real owner', async () => {
  const { main, trace } = loadFunction('vibe_manage_order', { openid: 'owner' });
  const result = await main({ actionType: 'PAY_ORDER', orderId: 'order-1' });
  assert.equal(result.error, 'PAYMENT_CONFIRMATION_REQUIRED');
  assert.equal(trace.tables.length, 0);
  assert.equal(trace.wxCalls, 0);
});
test('legitimate owner can still request a fresh payment attempt', async () => {
  const { main, trace } = loadFunction('vibe_manage_order', { openid: 'owner', orders: [{ id: 'order-1', openid: 'owner', status: 'pending_payment', total_amount: 38, created_at: new Date().toISOString() }] });
  const result = await main({ actionType: 'CREATE_PAYMENT_ATTEMPT', orderId: 'order-1' });
  assert.equal(result.success, true);
  assert.equal(result.totalAmountFen, 3800);
  assert.equal(trace.writes.length, 1);
  assert.equal(trace.writes[0].table, 'vibe_order_payments');
});
test('payment attempts remain forbidden for another owner', async () => {
  const { main, trace } = loadFunction('vibe_manage_order', { openid: 'other-user', orders: [{ id: 'order-1', openid: 'owner', status: 'pending_payment', total_amount: 38, created_at: new Date().toISOString() }] });
  assert.equal((await main({ actionType: 'CREATE_PAYMENT_ATTEMPT', orderId: 'order-1' })).error, 'FORBIDDEN');
  assert.equal(trace.writes.length, 0);
});
test('payment attempts remain forbidden after 30 minutes', async () => {
  const { main, trace } = loadFunction('vibe_manage_order', { openid: 'owner', orders: [{ id: 'order-1', openid: 'owner', status: 'pending_payment', total_amount: 38, created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() }] });
  assert.equal((await main({ actionType: 'CREATE_PAYMENT_ATTEMPT', orderId: 'order-1' })).error, 'ORDER_EXPIRED');
  assert.equal(trace.writes.length, 0);
});
test('each deployed admin function includes the same independent authorization helper', () => {
  const expected = read(`cloudfunctions/${webFunctions[0]}/admin-auth.js`);
  for (const name of webFunctions) assert.equal(read(`cloudfunctions/${name}/admin-auth.js`), expected);
});
