/**
 * tmdb-insane.ts
 *
 * Fetches a random movie from TMDb for Insane Mode.
 * Uses the discover endpoint with a random page to get movies that are
 * likely to have YouTube trailers, then validates and upserts the row.
 * Deduplicates via tmdb_id — never inserts the same movie twice.
 * All fetched movies are stored as scan_status='unvalidated' so the
 * batch scanner can validate them over time to enrich other game modes.
 *
 * Quality filter: only accepts YouTube trailers confirmed HD (720p+) via
 * the YouTube Data API. Falls back to accepting the video if the API is
 * unavailable. DB hits (existing movies) are trusted as-is.
 */

import { Movie } from '@/lib/database.types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
const YT_KEY   = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? '';

type Db = { from: (table: string) => any };

async function tmdbGet(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  try {
    const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Search TMDb for a person by name and return the top result's name.
 * Used to canonicalise a Whisper-mangled director name (e.g. "Guilherme del Toro" → "Guillermo del Toro").
 * Returns null if no result or API unavailable.
 */
export async function searchDirector(query: string): Promise<string | null> {
  if (!TMDB_KEY || !query.trim()) return null;
  const data = await tmdbGet(`/search/person?query=${encodeURIComponent(query)}&include_adult=false`);
  const name: string | undefined = data?.results?.[0]?.name;
  return name ?? null;
}

/**
 * Vets a candidate trailer with one videos.list call (same quota cost as the
 * old HD-only check): embed permission, privacy, age restriction, region
 * blocks, upload state, and HD quality. Any region restriction at all is a
 * skip — the candidate pool is effectively infinite, so being conservative
 * costs nothing and avoids "not available in your country" mid-game.
 * Falls back to permissive on API errors so quota exhaustion or a revoked
 * key never bricks Insane mode.
 */
async function isYouTubeUsable(videoId: string): Promise<boolean> {
  if (!YT_KEY) return true;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,status&key=${YT_KEY}`
    );
    if (!res.ok) return true;
    const item = (await res.json())?.items?.[0];
    if (!item) return false; // deleted / never existed
    const cd = item.contentDetails;
    const status = item.status;
    if (status?.embeddable === false) return false;
    if (status?.privacyStatus && status.privacyStatus !== 'public') return false;
    if (status?.uploadStatus && status.uploadStatus !== 'processed') return false;
    if (cd?.contentRating?.ytRating === 'ytAgeRestricted') return false;
    if (cd?.regionRestriction) return false;
    return cd?.definition === 'hd';
  } catch {
    return true;
  }
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function fetchRandomInsaneMovie(db: Db, platform: 'ios' | 'android' = 'ios'): Promise<Movie> {
  // Pick a random page from TMDb discover — movies with some votes are far
  // more likely to have YouTube trailers than purely random IDs.
  const page = Math.floor(Math.random() * 400) + 1;
  const discover = await tmdbGet(
    `/discover/movie?sort_by=vote_count.desc&vote_count.gte=10&page=${page}`
  );

  const candidateIds: number[] = discover?.results?.length
    ? shuffled(discover.results.map((r: any) => r.id))
    : Array.from({ length: 20 }, () => Math.floor(Math.random() * 1_000_000) + 1);

  for (const tmdbId of candidateIds) {
    // Check DB by tmdb_id first — always use the stored youtube_id, skips TMDb + YT API calls
    const { data: existing } = await db
      .from('movies')
      .select('*')
      .eq('tmdb_id', tmdbId)
      .maybeSingle();

    if (existing) {
      if (existing.scan_status === 'unusable' || existing.scan_status === 'flagged') continue;
      if (platform === 'android' && !existing.available_android) continue;
      if (platform === 'ios' && !existing.available_ios) continue;
      if (!existing.youtube_id) continue;
      return existing as Movie;
    }

    // Not in DB — fetch full details from TMDb
    const data = await tmdbGet(`/movie/${tmdbId}?append_to_response=videos,credits`);
    if (!data?.title || !data?.release_date) continue;

    const year = parseInt(data.release_date.slice(0, 4), 10);
    if (isNaN(year)) continue;

    // Official trailers first, then any trailer — filter to YouTube only
    const allTrailers = (data.videos?.results ?? [])
      .filter((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
    if (allTrailers.length === 0) continue;

    // Prefer trailers whose title doesn't reveal the release year.
    // Fall back to all trailers if every option includes it.
    const withoutYear = allTrailers.filter((v: any) => !String(v.name).includes(String(year)));
    const candidates = withoutYear.length > 0 ? withoutYear : allTrailers;
    const sorted = [...candidates].sort((a: any, b: any) => (a.official ? -1 : 1));

    // Find the first trailer that passes the HD quality check
    let trailer: any = null;
    for (const candidate of sorted) {
      if (await isYouTubeUsable(candidate.key)) { trailer = candidate; break; }
    }
    if (!trailer) continue;

    const director =
      (data.credits?.crew ?? []).find((c: any) => c.job === 'Director')?.name ?? 'Unknown';

    const { data: rows, error } = await db
      .from('movies')
      .insert({
        title: data.title,
        year,
        director,
        tmdb_id: tmdbId,
        youtube_id: trailer.key,
        safe_start: null,
        safe_end: null,
        scan_status: 'unvalidated',
        classic_pool: false,
        tags: [],
        flagged: false,
      })
      .select();

    // A real DB error (constraint violation, network, etc.) — skip this candidate
    if (error) { if (__DEV__) console.warn('[insane] insert error:', error.message); continue; }

    // INSERT succeeded. RETURNING may be empty if RLS blocks it on unvalidated rows.
    const inserted = rows?.[0] ?? null;
    if (!inserted) {
      // Row is in the DB but invisible to the anon client — fetch by tmdb_id
      const { data: fetched } = await db.from('movies').select('*').eq('tmdb_id', tmdbId).maybeSingle();
      if (!fetched) continue;
      return fetched as Movie;
    }
    return inserted as Movie;
  }

  throw new Error('Could not find a valid movie from TMDb after exhausting candidates');
}
