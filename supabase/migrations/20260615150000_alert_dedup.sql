-- M4: the "bottle late" auto-alert is generated client-side by every device
-- viewing the board, with only a non-atomic select-then-insert guard. Two
-- devices both see no existing alert and both insert one. Enforce "at most one
-- OPEN bottle_late alert per table" at the DB level so the race is impossible;
-- the loser of the race just gets a unique-violation, which the client ignores.
-- Scoped to bottle_late only: help_needed quick-requests intentionally allow
-- multiple open alerts per table.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_open_bottle_late_per_table
ON public.alerts (table_id)
WHERE resolved_at IS NULL AND kind = 'bottle_late' AND table_id IS NOT NULL;
