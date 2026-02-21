export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      movies: {
        Row: {
          id: string;
          title: string;
          year: number;
          director: string;
          youtube_id: string | null;
          safe_start: number | null;
          safe_end: number | null;
          poster_url: string | null;
          flagged: boolean;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          year: number;
          director: string;
          youtube_id?: string | null;
          safe_start?: number | null;
          safe_end?: number | null;
          poster_url?: string | null;
          flagged?: boolean;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['movies']['Insert']>;
      };
      games: {
        Row: {
          id: string;
          name: string | null;
          mode: 'digital' | 'physical';
          multiplayer_type: 'local' | 'online';
          status: 'lobby' | 'active' | 'finished';
          game_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          mode?: 'digital' | 'physical';
          multiplayer_type?: 'local' | 'online';
          status?: 'lobby' | 'active' | 'finished';
          game_code: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['games']['Insert']>;
      };
      players: {
        Row: {
          id: string;
          game_id: string;
          user_id: string | null;
          display_name: string;
          coins: number;
          timeline: number[];
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id?: string | null;
          display_name: string;
          coins?: number;
          timeline?: number[];
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['players']['Insert']>;
      };
      turns: {
        Row: {
          id: string;
          game_id: string;
          active_player_id: string;
          movie_id: string;
          placed_interval: number | null;
          status: 'drawing' | 'placing' | 'challenging' | 'revealing' | 'complete';
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          active_player_id: string;
          movie_id: string;
          placed_interval?: number | null;
          status?: 'drawing' | 'placing' | 'challenging' | 'revealing' | 'complete';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['turns']['Insert']>;
      };
      challenges: {
        Row: {
          id: string;
          turn_id: string;
          challenger_id: string;
          interval_index: number;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          turn_id: string;
          challenger_id: string;
          interval_index: number;
          resolved_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['challenges']['Insert']>;
      };
      reports: {
        Row: {
          id: string;
          movie_id: string;
          reported_by: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          movie_id: string;
          reported_by?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
      };
    };
  };
}

export type Movie = Database['public']['Tables']['movies']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];
export type Player = Database['public']['Tables']['players']['Row'];
export type Turn = Database['public']['Tables']['turns']['Row'];
export type Challenge = Database['public']['Tables']['challenges']['Row'];
export type Report = Database['public']['Tables']['reports']['Row'];
