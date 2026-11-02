-- Signed refund/unknown payment events are preserved for manual review.
-- They never change credits or order status automatically.
CREATE TABLE joy_payment_review_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  order_id text,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','ignored')),
  created_at bigint NOT NULL,
  reviewed_at bigint
);
CREATE INDEX joy_payment_review_events_status ON joy_payment_review_events(status, created_at);
