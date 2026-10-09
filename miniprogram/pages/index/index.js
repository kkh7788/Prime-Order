const shopConfig = require('../../config/shop');
const { loadCatalog } = require('../../utils/catalog');
const { enableShareMenu, getShareAppMessage, getShareTimeline } = require('../../utils/share');
Page({
  data: {
    shopName: shopConfig.shopName,
    homeHeroImage: shopConfig.homeHeroImage,
    featured: [], loading: true, loadError: false,
    customerServiceSession: shopConfig.customerServiceSession,
    customerServiceTitle: shopConfig.customerServiceTitle,
  },
  onLoad() { enableShareMenu(); },
  onShow() { this._loadFeatured(); },
  async _loadFeatured() {
    if (this._loading) return;
    this._loading = true;
    this.setData({ loadError: false, loading: !this.data.featured.length });
    try {
      const result = await loadCatalog();
      const recommendedIds = new Set(result.recommendations.map(r => r.productId));
      const products = result.products.map(product => {
        const prices = result.skus.filter(s => s.productId === product.id).map(s => Number(s.price)).filter(n => Number.isFinite(n) && n >= 0);
        const price = prices.length ? Math.min(...prices) : null;
        return { ...product, priceText: price === null ? '' : (Number.isInteger(price) ? String(price) : price.toFixed(2)), priceSuffix: prices.length > 1 ? '起' : '', canOrder: prices.length > 0 };
      }).filter(p => p.canOrder);
      const recommended = products.filter(p => recommendedIds.has(p.id));
      this.setData({ featured: (recommended.length ? recommended : products).slice(0, 3), loading: false });
    } catch (err) {
      this.setData({ loading: false, loadError: true });
    } finally { this._loading = false; }
  },
  onRetry() { this._loadFeatured(); },
  onHeroError() { this.setData({ homeHeroImage: '' }); },
  onStartShopping() { wx.switchTab({ url: '/pages/order/index' }); },
  onViewOrders() { wx.switchTab({ url: '/pages/orders/index' }); },
  onViewProfile() { wx.switchTab({ url: '/pages/profile/index' }); },
  onShareAppMessage() { return getShareAppMessage(); },
  onShareTimeline() { return getShareTimeline(); },
});
