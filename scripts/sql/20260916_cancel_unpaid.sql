-- Execute once before deploying the timer. Keeps all existing orders.
ALTER TABLE vibe_orders MODIFY COLUMN status
ENUM('pending_payment','paid','preparing','ready','shipped','completed','refunding','refunded','cancelled')
NOT NULL DEFAULT 'pending_payment';
