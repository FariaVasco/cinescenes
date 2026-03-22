/**
 * tmdb-insane.ts
 *
 * Fetches a random movie from TMDb for Insane Mode.
 * Uses the discover endpoint with a random page to get movies that are
 * likely to have YouTube trailers, then validates and upserts the row.
 */

import { Movie } from '@/lib/database.types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';

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

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function fetchRandomInsaneMovie(db: Db, requireTrailer = true): Promise<Movie> {
  // Pick a random page from TMDb discover — movies with some votes are far
  // more likely to have YouTube trailers than purely random IDs.
  const page = Math.floor(Math.random() * 400) + 1;
  const appendTo = requireTrailer ? 'videos,credits' : 'credits';
  const discover = await tmdbGet(
    `/discover/movie?sort_by=vote_count.desc&vote_count.gte=10&page=${page}`
  );

  const candidateIds: number[] = discover?.results?.length
    ? shuffled(discover.results.map((r: any) => r.id))
    : Array.from({ length: 20 }, () => Math.floor(Math.random() * 1_000_000) + 1);

  for (const tmdbId of candidateIds) {
    const data = await tmdbGet(`/movie/${tmdbId}?append_to_response=${appendTo}`);
    if (!data?.title || !data?.release_date) continue;

    const year = parseInt(data.release_date.slice(0, 4), 10);
    if (isNaN(year)) continue;

    const director =
      (data.credits?.crew ?? []).find((c: any) => c.job === 'Director')?.name ?? 'Unknown';

    if (requireTrailer) {
      const trailers = (data.videos?.results ?? [])
        .filter((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
      if (trailers.length === 0) continue;

      const trailer = trailers.sort((a: any, b: any) => (a.official ? -1 : 1))[0];

      // Return existing row if already in DB
      const { data: existing } = await db
        .from('movies')
        .select('*')
        .eq('youtube_id', trailer.key)
        .maybeSingle();

      if (existing) {
        if (existing.scan_status === 'unusable') continue;
        return existing as Movie;
      }

      const { data: inserted, error } = await db
        .from('movies')
        .insert({
          title: data.title,
          year,
          director,
          youtube_id: trailer.key,
          safe_start: null,
          safe_end: null,
          scan_status: 'unvalidated',
          standard_pool: false,
          tags: [],
          flagged: false,
          active: true,
        })
        .select()
        .single();

      if (error) { console.warn('[insane] insert error:', error.message); continue; }
      if (!inserted) continue;
      return inserted as Movie;
    } else {
      // Starting card: no trailer needed — just insert the movie and return
      const { data: inserted, error } = await db
        .from('movies')
        .insert({
          title: data.title,
          year,
          director,
          youtube_id: null,
          safe_start: null,
          safe_end: null,
          scan_status: 'unusable', // won't be dealt as a guessing turn
          standard_pool: false,
          tags: [],
          flagged: false,
          active: true,
        })
        .select()
        .single();

      if (error) { console.warn('[insane] starting card insert error:', error.message); continue; }
      if (!inserted) continue;
      return inserted as Movie;
    }
  }

  throw new Error('Could not find a valid movie from TMDb after exhausting candidates');
}
