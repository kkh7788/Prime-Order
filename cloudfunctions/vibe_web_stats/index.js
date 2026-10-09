const { getApp } = require('./db');

const { requireAdmin } = require('./admin-auth');

exports.main = async (event = {}) => {
  const rdb = getApp().rdb({ database: process.env.OPEN_SHOP_DATABASE || process.env.MYSQL_DATABASE || 'cloud1-d0gt8kuthcfd7b2d8' });

  const adminUid = await requireAdmin(rdb);
  if (!adminUid) return { success: false, error: 'FORBIDDEN' };

  const todayStr = new Date().toISOString().slice(0, 10); // "2026-05-18"

  // Weekly range: Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().slice(0, 10);

  const [todayRes, revenueRes, pendingPaidRes, pendingRefundRes, weekRes] = await Promise.all([
    // Today's order count (excluding pending_payment)
    rdb.from('vibe_orders')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'pending_payment')
      .gte('created_at', `${todayStr} 00:00:00`),
    // Today's revenue — fetch total_amount rows, sum in JS
    rdb.from('vibe_orders').select('total_amount').neq('status', 'pending_payment').gte('created_at', `${todayStr} 00:00:00`),
    // Orders pending ship (status=paid)
    rdb.from('vibe_orders').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
    // Orders pending refund (status=refunding)
    rdb.from('vibe_orders').select('id', { count: 'exact', head: true }).eq('status', 'refunding'),
    // This week's orders for daily revenue (Mon-Sun)
    rdb.from('vibe_orders').select('total_amount, created_at')
      .neq('status', 'pending_payment')
      .gte('created_at', `${mondayStr} 00:00:00`),
  ]);

  const todayOrders = todayRes.count ?? (todayRes.data?.length ?? 0);
  const todayRevenue = (revenueRes.data || []).reduce((s, r) => s + parseFloat(r.total_amount), 0);
  const pendingShip = pendingPaidRes.count ?? (pendingPaidRes.data?.length ?? 0);
  const pendingRefund = pendingRefundRes.count ?? (pendingRefundRes.data?.length ?? 0);

  // Build weeklyRevenue [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  const weeklyRevenue = [0, 0, 0, 0, 0, 0, 0];
  for (const row of (weekRes.data || [])) {
    const d = new Date(row.created_at);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0=Mon, 6=Sun
    weeklyRevenue[dow] += parseFloat(row.total_amount);
  }

  return {
    success: true,
    todayOrders,
    todayRevenue: parseFloat(todayRevenue.toFixed(2)),
    pending: { paid: pendingShip, refunding: pendingRefund },
    weeklyRevenue: weeklyRevenue.map(v => parseFloat(v.toFixed(2))),
  };
};
