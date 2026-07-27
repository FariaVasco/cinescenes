-- Split the overloaded games.visibility into two independent axes:
--   visibility   = discoverability (public browser listing) — unchanged
--   trailer_mode = trailer playback location: 'all' (every phone plays its own
--                  trailer) vs 'host' (only the host's phone plays)
--
-- Previously visibility='public' also implied all-phones, so a private game toggled
-- to "All phones" was written as visibility='public' and leaked into the public
-- games browser. This column decouples the two so private + all-phones is possible.

alter table games
  add column trailer_mode text not null default 'host'
  check (trailer_mode in ('all', 'host'));

-- Backfill existing rows to preserve today's behavior:
--   public games played on all phones; invite_only games on the host's screen.
update games set trailer_mode = 'all' where visibility = 'public';
