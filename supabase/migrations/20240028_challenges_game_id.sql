-- Add game_id to challenges so realtime (postgres_changes) can filter per game.
-- postgres_changes only supports per-column equality filters (game_id=eq.<id>);
-- without this column, per-game challenge subscriptions are impossible.

alter table challenges add column game_id uuid references games(id) on delete cascade;

-- Backfill from the parent turn (idempotent, safe to re-run)
update challenges c
set game_id = t.game_id
from turns t
where c.turn_id = t.id and c.game_id is null;

alter table challenges alter column game_id set not null;

create index if not exists challenges_game_id_idx on challenges (game_id);
