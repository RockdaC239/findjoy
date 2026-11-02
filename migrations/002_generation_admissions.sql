CREATE TABLE joy_generation_admissions (
  token text PRIMARY KEY,
  user_id text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX joy_generation_admissions_expiry ON joy_generation_admissions(expires_at);
