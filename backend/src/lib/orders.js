// In-room dining orders. Prices always come from the database (never from the
// guest's phone), and each order line keeps the price at the time of ordering.
import { query, transaction } from '../db/pool.js';
import { broadcastMessage, saveMessage } from './chat.js';
import { emitOps } from './realtime.js';
import { HttpError } from './errors.js';

export const ORDER_STATUSES = ['placed', 'preparing', 'on_the_way', 'delivered', 'cancelled'];

const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const ORDER_SELECT = `
  SELECT o.id, o.stay_id, o.status, o.note, o.total_paise, o.escalated_at, o.created_at, o.updated_at,
         r.number AS room_number, s.guest_name,
         COALESCE(json_agg(json_build_object('name', oi.name, 'quantity', oi.quantity,
                  'unit_price_paise', oi.unit_price_paise) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
    FROM orders o
    JOIN stays s ON s.id = o.stay_id
    JOIN rooms r ON r.id = s.room_id
    LEFT JOIN order_items oi ON oi.order_id = o.id`;

export async function getOrder(hotelId, orderId) {
  const { rows: [order] } = await query(`${ORDER_SELECT} WHERE o.id = $1 AND o.hotel_id = $2 GROUP BY o.id, r.number, s.guest_name`, [orderId, hotelId]);
  return order ?? null;
}

export async function listOrders(hotelId, { stayId = null, active = false } = {}) {
  const { rows } = await query(
    `${ORDER_SELECT}
      WHERE o.hotel_id = $1
        AND ($2::int IS NULL OR o.stay_id = $2)
        AND (NOT $3 OR o.status IN ('placed', 'preparing', 'on_the_way')
             OR (o.status = 'delivered' AND o.updated_at > now() - interval '2 hours'))
      GROUP BY o.id, r.number, s.guest_name
      ORDER BY o.id DESC
      LIMIT 200`,
    [hotelId, stayId, active],
  );
  return rows;
}

// Running bill for a stay: every order that wasn't cancelled.
export async function stayBill(hotelId, stayId) {
  const orders = await listOrders(hotelId, { stayId });
  const charged = orders.filter((o) => o.status !== 'cancelled');
  return { orders, total_paise: charged.reduce((sum, o) => sum + o.total_paise, 0) };
}

async function notify(hotelId, order, text) {
  const message = await saveMessage({ stayId: order.stay_id, sender: 'system', body: text });
  broadcastMessage(hotelId, message);
}

export async function placeOrder({ hotelId, stayId, lines, note }) {
  const ids = [...new Set(lines.map((l) => l.id))];
  const { rows: items } = await query(
    'SELECT id, name, price_paise, available FROM menu_items WHERE hotel_id = $1 AND id = ANY($2)', [hotelId, ids],
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const merged = new Map();
  for (const { id, quantity } of lines) {
    const item = byId.get(id);
    if (!item) throw new HttpError(400, 'An item in your order is no longer on the menu. Please refresh.');
    if (!item.available) throw new HttpError(409, `Sorry, ${item.name} is not available right now.`);
    merged.set(id, Math.min(50, (merged.get(id) ?? 0) + quantity));
  }
  const total = [...merged].reduce((sum, [id, qty]) => sum + byId.get(id).price_paise * qty, 0);

  const orderId = await transaction(async (db) => {
    const { rows: [order] } = await db.query(
      'INSERT INTO orders (hotel_id, stay_id, note, total_paise) VALUES ($1, $2, $3, $4) RETURNING id',
      [hotelId, stayId, note, total],
    );
    for (const [id, qty] of merged) {
      const item = byId.get(id);
      await db.query(
        'INSERT INTO order_items (order_id, menu_item_id, name, unit_price_paise, quantity) VALUES ($1, $2, $3, $4, $5)',
        [order.id, id, item.name, item.price_paise, qty],
      );
    }
    return order.id;
  });

  const order = await getOrder(hotelId, orderId);
  const summary = order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
  await notify(hotelId, order, `Order #${order.id} placed: ${summary}. Total ${rupees(order.total_paise)}${note ? `. Note: ${note}` : ''}`);
  emitOps(hotelId, 'kitchen', 'order:new', order, stayId);
  return order;
}

const GUEST_UPDATES = {
  preparing: (id) => `Your order #${id} is being prepared.`,
  on_the_way: (id) => `Your order #${id} is on the way to your room.`,
  delivered: (id) => `Your order #${id} has been delivered. Enjoy your meal!`,
  cancelled: (id) => `Order #${id} was cancelled.`,
};

// Orders only move forward (placed -> preparing -> on the way -> delivered);
// they can be cancelled any time before delivery.
export async function setOrderStatus(hotelId, orderId, status, { byGuestStayId = null } = {}) {
  const current = await getOrder(hotelId, orderId);
  if (!current || (byGuestStayId && current.stay_id !== byGuestStayId)) throw new HttpError(404, 'Order not found');
  if (current.status === status) return current;
  const from = ORDER_STATUSES.indexOf(current.status);
  const to = ORDER_STATUSES.indexOf(status);
  const allowed = status === 'cancelled'
    ? ['placed', 'preparing', 'on_the_way'].includes(current.status) && (!byGuestStayId || current.status === 'placed')
    : current.status !== 'cancelled' && to > from;
  if (!allowed) {
    throw new HttpError(409, byGuestStayId ? 'This order is already being prepared and can no longer be cancelled.' : 'That status change is not allowed.');
  }
  await query('UPDATE orders SET status = $3, updated_at = now() WHERE id = $1 AND hotel_id = $2', [orderId, hotelId, status]);
  const order = await getOrder(hotelId, orderId);
  await notify(hotelId, order, GUEST_UPDATES[status](order.id));
  emitOps(hotelId, 'kitchen', 'order:updated', order, order.stay_id);
  return order;
}
