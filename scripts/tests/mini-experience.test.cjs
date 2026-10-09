const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../miniprogram');
function catalogClient(callFunction) {
 const module = {exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'utils/catalog.js'),'utf8'),{module,wx:{cloud:{callFunction}}});
 return module.exports;
}
function page(name,callFunction) {
 let definition;
 const app={globalData:{cart:[]}};
 const wx={cloud:{callFunction},showToast(){},switchTab(){},createSelectorQuery(){return {in(){return this},select(){return this},selectAll(){return this},boundingClientRect(){return this},exec(){}}}};
 const client=catalogClient(callFunction);
 vm.runInNewContext(fs.readFileSync(path.join(root,`pages/${name}/index.js`),'utf8'),{Page:p=>definition=p,wx,getApp:()=>app,setTimeout:()=>1,clearTimeout(){},console:{error(){}},require:n=>n.includes('catalog')?client:n.includes('share')?{enableShareMenu(){}}:{shopName:'Prime Order'}});
 const instance={...definition,data:structuredClone(definition.data),setData(d){Object.assign(this.data,d)}};
 return {instance,app};
}
const menu=()=>({success:true,categories:[{id:1,_id:1,name:'推荐'},{id:2,_id:2,name:'食品'}],products:[{id:'p',_id:'p',categoryId:2,title:'饭'}],skus:[{id:'s',productId:'p',price:2}],recommendations:[]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('concurrent menu visits share one request; later visit fetches new data',async()=>{
 const d=deferred();let calls=0;const c=catalogClient(()=>{calls++;return d.promise});
 const a=c.loadCatalog(),b=c.loadCatalog();await Promise.resolve();assert.equal(calls,1);
 d.resolve({result:menu()});await Promise.all([a,b]);await c.loadCatalog();assert.equal(calls,2);
});
test('failed or malformed menu response can be retried',async()=>{
 let calls=0;const c=catalogClient(async()=>{calls++;return {result:calls===1?{success:true}:menu()}});
 await assert.rejects(c.loadCatalog());assert.equal((await c.loadCatalog()).products.length,1);
});
test('menu refresh retains selected category and cart quantity, shows new products',async()=>{
 let count=0;const {instance:p,app}=page('order',async()=>{const result=menu();if(++count>1)result.products.push({id:'new',_id:'new',categoryId:2,title:'新菜'});return {result}});
 app.globalData.cart=[{productId:'p',quantity:3,price:2}];p.onLoad();await p._loadCatalog();p.data.activeCategory=2;await p._loadCatalog();
 assert.equal(p.data.activeCategory,2);assert.equal(p.data.cartTotalQty,3);assert.equal(p.data.productSections[1].products.length,2);assert.equal(p.data.productSections[1].products.find(x=>x.id==='p').cartQty,3);assert.equal(p.data.refreshing,false);
});
test('menu failure keeps existing dishes and clears refreshing indicator',async()=>{
 let fail=false;const {instance:p}=page('order',async()=>{if(fail)throw Error('offline');return {result:menu()}});p.onLoad();await p._loadCatalog();fail=true;await p._loadCatalog();assert.equal(p.data.productSections.length,2);assert.equal(p.data.loadError,true);assert.equal(p.data.refreshing,false);
});
test('slow old order response cannot overwrite a newer filter',async()=>{
 const requests=[];const {instance:p}=page('orders',()=>{const d=deferred();requests.push(d);return d.promise});
 const first=p._loadOrders();p.data.activeTab=1;const second=p._loadOrders();requests[1].resolve({result:{success:true,orders:[{id:'new',items:[],status:'pending_payment'}]}});await second;requests[0].resolve({result:{success:true,orders:[{id:'old',items:[],status:'paid'}]}});await first;assert.equal(p.data.orders[0].id,'new');assert.equal(p.data.loading,false);
});
test('order display handles decimal strings and null item subtotal',async()=>{
 const {instance:p}=page('orders',async()=>({result:{success:true,orders:[{totalAmount:'76.00',subtotal:'76.00',shippingFee:'0',items:[{subtotal:null,price:'38',quantity:2}]}]}}));await p._loadOrders();assert.equal(p.data.orders[0].totalAmountFormatted,'76.00');assert.equal(p.data.orders[0].items[0].itemSubtotalFormatted,'76.00');
});
test('home picks actual recommended saleable products and excludes missing SKUs',async()=>{
 const result=menu();result.products.push({id:'unavailable',title:'无规格'});result.recommendations=[{productId:'p'}];const {instance:p}=page('index',async()=>({result}));await p._loadFeatured();assert.equal(p.data.featured.length,1);assert.equal(p.data.featured[0].id,'p');assert.equal(p.data.featured[0].priceText,'2');
});
