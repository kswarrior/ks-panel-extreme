-- 038_instance_suspension.sql: add suspension fields to instances table

-- suspended: 0 = not suspended, 1 = suspended
-- suspended_until: NULL = until admin unsuspends, timestamp = auto-unsuspend at that time
-- suspension_count: number of times instance has been suspended (for badge display)
-- suspension_history: JSONB array of suspension records (timestamp, reason, duration, admin_id)

ALTER TABLE instances ADD COLUMN IF NOT EXISTS suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS suspension_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS suspension_history JSONB;

CREATE INDEX IF NOT EXISTS idx_instances_suspended ON instances(suspended);