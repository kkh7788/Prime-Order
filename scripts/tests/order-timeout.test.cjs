const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isExpired,cancelExpired}=require('../../cloudfunctions/vibe_cron_auto_cancel/order-expiry');
const now=Date.parse('2026-09-16T13:00:00Z');
test('30 minute UTC boundary',()=>{
 assert.equal(isExpired('2026-09-16 12:30:01',now),false);
 assert.equal(isExpired('2026-09-16 12:30:00',now),true);
 assert.equal(isExpired('2026-09-16 12:29:59',now),true);
 assert.equal(isExpired('invalid',now),true);
});
test('atomic filter protects paid and recent orders, retries safe',async()=>{
 const rows=[{status:'pending_payment',created_at:'2026-09-16 12:30:00'}, {status:'paid',created_at:'2026-09-16 12:00:00'}, {status:'pending_payment',created_at:'2026-09-16 12:30:01'}];
 const db={from(table){assert.equal(table,'vibe_orders');return {update(data){this.data=data;return this},eq(k,v){assert.equal(k,'status');this.status=v;return this},async lte(k,v){assert.equal(k,'created_at'); for(const row of rows)if(row.status===this.status&&row[k]<=v)Object.assign(row,this.data);return {error:null}}}}};
 await cancelExpired(db,now);await cancelExpired(db,now);
 assert.deepEqual(rows.map(r=>r.status),['cancelled','paid','pending_payment']);
});
test('database error fails invocation for monitoring/retry',async()=>{
 const q={update(){return this},eq(){return this},lte(){return {error:{message:'db unavailable'}}}};
 await assert.rejects(()=>cancelExpired({from:()=>q},now),/db unavailable/);
});
