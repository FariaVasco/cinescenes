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
          flagged: boolean;
          classic_pool: boolean;
          tags: string[];
          scan_status: 'validated' | 'unvalidated' | 'unusable' | 'flagged';
          available_ios: boolean;
          available_android: boolean;
          tmdb_id: number | null;
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
          flagged?: boolean;
          classic_pool?: boolean;
          tags?: string[];
          scan_status?: 'validated' | 'unvalidated' | 'unusable' | 'flagged';
          available_ios?: boolean;
          available_android?: boolean;
          tmdb_id?: number | null;
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
          status: 'lobby' | 'active' | 'finished' | 'cancelled';
          game_code: string;
          game_mode: 'classic' | 'collection' | 'insane';
          collection_id: string | null;
          max_players: number;
          visibility: 'public' | 'invite_only';
          trailer_platform: 'ios' | 'android' | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          mode?: 'digital' | 'physical';
          multiplayer_type?: 'local' | 'online';
          status?: 'lobby' | 'active' | 'finished' | 'cancelled';
          game_code: string;
          game_mode?: 'classic' | 'collection' | 'insane';
          collection_id?: string | null;
          max_players?: number;
          visibility?: 'public' | 'invite_only';
          trailer_platform?: 'ios' | 'android' | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['games']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          trial_used_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          trial_used_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      collections: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          display_type: string;
          tag: string;
          cover_movie_id: string | null;
          is_active: boolean;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          display_type?: string;
          tag: string;
          cover_movie_id?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['collections']['Insert']>;
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
          last_seen: string | null;
          left_at: string | null;
          platform: 'ios' | 'android' | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id?: string | null;
          display_name: string;
          coins?: number;
          timeline?: number[];
          created_at?: string;
          last_seen?: string | null;
          left_at?: string | null;
          platform?: 'ios' | 'android' | null;
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
          placing_started_at?: string | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          active_player_id: string;
          movie_id: string;
          placed_interval?: number | null;
          status?: 'drawing' | 'placing' | 'challenging' | 'revealing' | 'complete';
          created_at?: string;
          placing_started_at?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          turn_id: string;
          challenger_id: string;
          interval_index: number;
          resolved_at?: string | null;
          created_at?: string;
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
      feedback: {
        Row: {
          id: string;
          category: 'works_well' | 'improvement' | 'bug' | 'idea';
          note: string;
          email: string | null;
          user_id: string | null;
          app_version: string | null;
          platform: 'ios' | 'android' | 'web' | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          category: 'works_well' | 'improvement' | 'bug' | 'idea';
          note: string;
          email?: string | null;
          user_id?: string | null;
          app_version?: string | null;
          platform?: 'ios' | 'android' | 'web' | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['feedback']['Insert']>;
      };
      app_config: {
        Row: {
          id: number;
          min_version_ios: string;
          min_version_android: string;
        };
        Insert: {
          id?: number;
          min_version_ios?: string;
          min_version_android?: string;
        };
        Update: Partial<Database['public']['Tables']['app_config']['Insert']>;
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
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Collection = Database['public']['Tables']['collections']['Row'];
export type Feedback = Database['public']['Tables']['feedback']['Row'];
