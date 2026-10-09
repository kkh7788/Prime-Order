const { getApp } = require('./db');
const { cancelExpired } = require('./order-expiry');
exports.main = async () => {
  const database = process.env.OPEN_SHOP_DATABASE || process.env.MYSQL_DATABASE || 'cloud1-d0gt8kuthcfd7b2d8';
  await cancelExpired(getApp().rdb({ database }));
  return { success: true };
};
