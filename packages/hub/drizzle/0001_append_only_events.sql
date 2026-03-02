-- Enforce append-only on events table at DB level (belt-and-suspenders).
-- The application layer (EventRepository) also enforces this.
-- NOTE: This trigger is not applied in pg-mem tests (not supported).
-- In production PostgreSQL, apply this migration after 0000_initial.sql.

CREATE OR REPLACE FUNCTION prevent_events_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'events table is append-only: UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_append_only_update
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION prevent_events_modification();

CREATE TRIGGER events_append_only_delete
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION prevent_events_modification();

-- Index for catchup queries: server_seq range scans
CREATE INDEX IF NOT EXISTS idx_events_server_seq ON events (server_seq);

-- Index for offline message catchup (TTL mode only)
CREATE INDEX IF NOT EXISTS idx_offline_messages_catchup
  ON offline_messages (server_seq)
  WHERE expires_at > NOW();
