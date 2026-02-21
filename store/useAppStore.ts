import { create } from 'zustand';
import { Movie } from '@/lib/database.types';

interface AppState {
  // Current movie (trailer screen)
  currentMovie: Movie | null;
  setCurrentMovie: (movie: Movie | null) => void;

  // Active movies pool cache
  activeMovies: Movie[];
  setActiveMovies: (movies: Movie[]) => void;

  // Phase 3+: game state (scaffolded, unused in Phase 1)
  gameId: string | null;
  playerId: string | null;
  setGameId: (id: string | null) => void;
  setPlayerId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentMovie: null,
  setCurrentMovie: (movie) => set({ currentMovie: movie }),

  activeMovies: [],
  setActiveMovies: (movies) => set({ activeMovies: movies }),

  gameId: null,
  playerId: null,
  setGameId: (id) => set({ gameId: id }),
  setPlayerId: (id) => set({ playerId: id }),
}));
