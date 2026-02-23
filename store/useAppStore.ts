import { create } from 'zustand';
import { Movie } from '@/lib/database.types';

interface AppState {
  // Current movie (trailer screen)
  currentMovie: Movie | null;
  setCurrentMovie: (movie: Movie | null) => void;

  // Whether the current trailer was started by scanning a QR code
  fromScanner: boolean;
  setFromScanner: (v: boolean) => void;

  // Active movies pool cache
  activeMovies: Movie[];
  setActiveMovies: (movies: Movie[]) => void;

  // TV / Cast mode
  tvMode: boolean;
  setTvMode: (v: boolean) => void;

  // Phase 3+: game state (scaffolded, unused in Phase 1)
  gameId: string | null;
  playerId: string | null;
  setGameId: (id: string | null) => void;
  setPlayerId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentMovie: null,
  setCurrentMovie: (movie) => set({ currentMovie: movie }),

  fromScanner: false,
  setFromScanner: (v) => set({ fromScanner: v }),

  activeMovies: [],
  setActiveMovies: (movies) => set({ activeMovies: movies }),

  tvMode: false,
  setTvMode: (v) => set({ tvMode: v }),

  gameId: null,
  playerId: null,
  setGameId: (id) => set({ gameId: id }),
  setPlayerId: (id) => set({ playerId: id }),
}));
