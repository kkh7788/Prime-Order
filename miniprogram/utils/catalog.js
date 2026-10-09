// Share in-flight requests across tabs; every later visit gets fresh menu data.
let pending = null;
function loadCatalog() {
  if (pending) return pending;
  pending = Promise.resolve().then(() => wx.cloud.callFunction({ name: 'vibe_catalog' }))
    .then(({ result }) => {
      if (!result || !result.success || !Array.isArray(result.categories) ||
          !Array.isArray(result.products) || !Array.isArray(result.skus)) {
        throw new Error('菜单暂时无法加载');
      }
      return { ...result, recommendations: result.recommendations || [] };
    }).finally(() => { pending = null; });
  return pending;
}
module.exports = { loadCatalog };
