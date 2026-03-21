/**
 * tmdb-insane.ts
 *
 * Fetches a random movie from TMDb for Insane Mode.
 * Tries up to 20 random integer IDs, validates the movie has a YouTube trailer,
 * skips anything already flagged unusable in the DB, then upserts the row.
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

export async function fetchRandomInsaneMovie(db: Db): Promise<Movie> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tmdbId = Math.floor(Math.random() * 1_000_000) + 1;

    const data = await tmdbGet(`/movie/${tmdbId}?append_to_response=videos,credits`);
    if (!data || !data.title || !data.release_date) continue;

    const year = parseInt(data.release_date.slice(0, 4), 10);
    if (isNaN(year)) continue;

    const trailers = (data.videos?.results ?? [])
      .filter((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
    if (trailers.length === 0) continue;

    const trailer = trailers.sort((a: any, b: any) => (a.official ? -1 : 1))[0];
    const director =
      (data.credits?.crew ?? []).find((c: any) => c.job === 'Director')?.name ?? 'Unknown';

    // Check if already in DB
    const { data: existing } = await db
      .from('movies')
      .select('*')
      .eq('youtube_id', trailer.key)
      .maybeSingle();

    if (existing) {
      if (existing.scan_status === 'unusable') continue;
      return existing as Movie;
    }

    // Insert new unvalidated movie
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

    if (error || !inserted) continue;
    return inserted as Movie;
  }

  throw new Error('Could not find a valid movie from TMDb after 20 attempts');
}
