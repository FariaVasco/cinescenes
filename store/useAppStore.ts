import { create } from 'zustand';
import { Movie, Game, Player, Turn, Challenge } from '@/lib/database.types';

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

  // Phase 3+: game state
  gameId: string | null;
  playerId: string | null;
  setGameId: (id: string | null) => void;
  setPlayerId: (id: string | null) => void;

  // Multiplayer game state
  game: Game | null;
  players: Player[];
  currentTurn: Turn | null;
  challenges: Challenge[];
  isHost: boolean;
  setGame: (g: Game | null) => void;
  setPlayers: (p: Player[]) => void;
  setCurrentTurn: (t: Turn | null) => void;
  setChallenges: (c: Challenge[]) => void;
  setIsHost: (v: boolean) => void;
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

  game: null,
  players: [],
  currentTurn: null,
  challenges: [],
  isHost: false,
  setGame: (g) => set({ game: g }),
  setPlayers: (p) => set({ players: p }),
  setCurrentTurn: (t) => set({ currentTurn: t }),
  setChallenges: (c) => set({ challenges: c }),
  setIsHost: (v) => set({ isHost: v }),
}));
