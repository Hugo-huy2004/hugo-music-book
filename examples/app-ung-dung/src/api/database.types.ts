export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      artists: {
        Row: {
          bio: string
          created_at: string
          id: number
          name: string
          photo_url: string | null
          source_url: string | null
        }
        Insert: {
          bio?: string
          created_at?: string
          id?: never
          name: string
          photo_url?: string | null
          source_url?: string | null
        }
        Update: {
          bio?: string
          created_at?: string
          id?: never
          name?: string
          photo_url?: string | null
          source_url?: string | null
        }
        Relationships: []
      }
      blind_rooms: {
        Row: {
          active: boolean
          colors: string[]
          id: number
          name: string
          pinned: string[]
          rules: Json
          slug: string
          sort_order: number
          tagline: string | null
        }
        Insert: {
          active?: boolean
          colors?: string[]
          id?: never
          name: string
          pinned?: string[]
          rules?: Json
          slug: string
          sort_order?: number
          tagline?: string | null
        }
        Update: {
          active?: boolean
          colors?: string[]
          id?: never
          name?: string
          pinned?: string[]
          rules?: Json
          slug?: string
          sort_order?: number
          tagline?: string | null
        }
        Relationships: []
      }
      blind_trials: {
        Row: {
          a_at: string
          a_kbps: number
          b_at: string
          b_kbps: number
          excerpt_sec: number
          excerpt_start: number
          id: string
          is_control: boolean
          no: number
          reveal_until: string
          revealed: boolean
          room_id: number
          song_id: string
          vote_until: string
        }
        Insert: {
          a_at: string
          a_kbps: number
          b_at: string
          b_kbps: number
          excerpt_sec?: number
          excerpt_start: number
          id?: string
          is_control: boolean
          no: number
          reveal_until: string
          revealed?: boolean
          room_id: number
          song_id: string
          vote_until: string
        }
        Update: {
          a_at?: string
          a_kbps?: number
          b_at?: string
          b_kbps?: number
          excerpt_sec?: number
          excerpt_start?: number
          id?: string
          is_control?: boolean
          no?: number
          reveal_until?: string
          revealed?: boolean
          room_id?: number
          song_id?: string
          vote_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "blind_trials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "blind_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blind_trials_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      blind_votes: {
        Row: {
          choice: string
          correct: boolean | null
          created_at: string
          trial_id: string
          user_id: string
        }
        Insert: {
          choice: string
          correct?: boolean | null
          created_at?: string
          trial_id: string
          user_id?: string
        }
        Update: {
          choice?: string
          correct?: boolean | null
          created_at?: string
          trial_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blind_votes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "blind_trials"
            referencedColumns: ["id"]
          },
        ]
      }
      genre_groups: {
        Row: {
          colors: string[]
          key: string
          label: string
          label_en: string
          pattern: string | null
          sort_order: number
        }
        Insert: {
          colors: string[]
          key: string
          label: string
          label_en: string
          pattern?: string | null
          sort_order?: number
        }
        Update: {
          colors?: string[]
          key?: string
          label?: string
          label_en?: string
          pattern?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          user_id?: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "listening_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          key: string
          label: string
          no_derivatives: boolean
        }
        Insert: {
          key: string
          label: string
          no_derivatives?: boolean
        }
        Update: {
          key?: string
          label?: string
          no_derivatives?: boolean
        }
        Relationships: []
      }
      listening_groups: {
        Row: {
          code: string
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pipeline_runs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: number
          meta: Json
          song_id: string
          status: string
          step: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: never
          meta?: Json
          song_id: string
          status?: string
          step?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: never
          meta?: Json
          song_id?: string
          status?: string
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playback_grants: {
        Row: {
          created_at: string
          day: string
          song_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day?: string
          song_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          song_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playback_grants_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_songs: {
        Row: {
          added_at: string
          playlist_id: string
          position: number
          song_id: string
        }
        Insert: {
          added_at?: string
          playlist_id: string
          position: number
          song_id: string
        }
        Update: {
          added_at?: string
          playlist_id?: string
          position?: number
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_songs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      plays: {
        Row: {
          completed: boolean
          created_at: string
          id: number
          platform: string | null
          played_ms: number | null
          rebuffer_count: number | null
          song_id: string
          startup_ms: number | null
          tier_kbps: number | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: never
          platform?: string | null
          played_ms?: number | null
          rebuffer_count?: number | null
          song_id: string
          startup_ms?: number | null
          tier_kbps?: number | null
          user_id?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: never
          platform?: string | null
          played_ms?: number | null
          rebuffer_count?: number | null
          song_id?: string
          startup_ms?: number | null
          tier_kbps?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plays_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      preference_genres: {
        Row: {
          name: string
          sort_order: number
        }
        Insert: {
          name: string
          sort_order?: number
        }
        Update: {
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_detail: string | null
          avatar_url: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          id: string
          music_genres: string[]
          nickname: string | null
          phone: string | null
          province: string | null
          username: string | null
          ward: string | null
        }
        Insert: {
          address_detail?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          id: string
          music_genres?: string[]
          nickname?: string | null
          phone?: string | null
          province?: string | null
          username?: string | null
          ward?: string | null
        }
        Update: {
          address_detail?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          id?: string
          music_genres?: string[]
          nickname?: string | null
          phone?: string | null
          province?: string | null
          username?: string | null
          ward?: string | null
        }
        Relationships: []
      }
      song_likes: {
        Row: {
          created_at: string
          song_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          song_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          song_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_likes_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          album_title: string | null
          album_year: number | null
          artist_id: number
          attribution: string | null
          bpm: number | null
          country: string | null
          cover_color: string | null
          cover_path: string | null
          created_at: string
          duration_sec: number
          genre: string | null
          hls_path: string | null
          hls_tiers: number[]
          id: string
          license: string
          license_url: string | null
          likes_count: number
          loudness_lufs: number | null
          original_path: string | null
          plain_lyrics: string | null
          psl_mos: Json | null
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_text: string | null
          source_url: string
          status: Database["public"]["Enums"]["song_status"]
          synced_lyrics: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          album_title?: string | null
          album_year?: number | null
          artist_id: number
          attribution?: string | null
          bpm?: number | null
          country?: string | null
          cover_color?: string | null
          cover_path?: string | null
          created_at?: string
          duration_sec?: number
          genre?: string | null
          hls_path?: string | null
          hls_tiers?: number[]
          id?: string
          license: string
          license_url?: string | null
          likes_count?: number
          loudness_lufs?: number | null
          original_path?: string | null
          plain_lyrics?: string | null
          psl_mos?: Json | null
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_text?: string | null
          source_url: string
          status?: Database["public"]["Enums"]["song_status"]
          synced_lyrics?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          album_title?: string | null
          album_year?: number | null
          artist_id?: number
          attribution?: string | null
          bpm?: number | null
          country?: string | null
          cover_color?: string | null
          cover_path?: string | null
          created_at?: string
          duration_sec?: number
          genre?: string | null
          hls_path?: string | null
          hls_tiers?: number[]
          id?: string
          license?: string
          license_url?: string | null
          likes_count?: number
          loudness_lufs?: number | null
          original_path?: string | null
          plain_lyrics?: string | null
          psl_mos?: Json | null
          published_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_text?: string | null
          source_url?: string
          status?: Database["public"]["Enums"]["song_status"]
          synced_lyrics?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "songs_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      station_now: {
        Row: {
          ends_at: string
          song_id: string
          started_at: string
          station_id: number
        }
        Insert: {
          ends_at: string
          song_id: string
          started_at: string
          station_id: number
        }
        Update: {
          ends_at?: string
          song_id?: string
          started_at?: string
          station_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "station_now_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_now_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: true
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_requests: {
        Row: {
          created_at: string
          id: number
          played_at: string | null
          song_id: string
          station_id: number
          user_id: string
          votes: number
        }
        Insert: {
          created_at?: string
          id?: never
          played_at?: string | null
          song_id: string
          station_id: number
          user_id?: string
          votes?: number
        }
        Update: {
          created_at?: string
          id?: never
          played_at?: string | null
          song_id?: string
          station_id?: number
          user_id?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "station_requests_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_requests_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_votes: {
        Row: {
          request_id: number
          user_id: string
        }
        Insert: {
          request_id: number
          user_id?: string
        }
        Update: {
          request_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "station_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          active: boolean
          allow_requests: boolean
          colors: string[]
          genre_pattern: string | null
          id: number
          name: string
          pinned: string[]
          rules: Json
          slug: string
          sort_order: number
          tagline: string | null
        }
        Insert: {
          active?: boolean
          allow_requests?: boolean
          colors?: string[]
          genre_pattern?: string | null
          id?: never
          name: string
          pinned?: string[]
          rules?: Json
          slug: string
          sort_order?: number
          tagline?: string | null
        }
        Update: {
          active?: boolean
          allow_requests?: boolean
          colors?: string[]
          genre_pattern?: string | null
          id?: never
          name?: string
          pinned?: string[]
          rules?: Json
          slug?: string
          sort_order?: number
          tagline?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      artist_stats: {
        Row: {
          albums: number | null
          bio: string | null
          cover_path: string | null
          created_at: string | null
          id: number | null
          name: string | null
          photo_url: string | null
          popularity: number | null
          published: number | null
          songs: number | null
          source_url: string | null
        }
        Relationships: []
      }
      blind_results: {
        Row: {
          high_kbps: number | null
          hit_rate: number | null
          low_kbps: number | null
          same_rate: number | null
          votes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_albums: {
        Args: { p_limit?: number; p_page?: number; p_q?: string }
        Returns: Json
      }
      admin_overview: { Args: never; Returns: Json }
      admin_revoke_sessions: { Args: { p_id: string }; Returns: undefined }
      admin_room_dequeue: { Args: { p_request_id: number }; Returns: undefined }
      admin_room_enqueue: {
        Args: { p_song_id: string; p_station_id: number }
        Returns: undefined
      }
      admin_room_preview: { Args: { p_rules: Json }; Returns: Json }
      admin_room_skip: { Args: { p_station_id: number }; Returns: undefined }
      admin_rooms: { Args: never; Returns: Json }
      admin_update_album: {
        Args: {
          p_artist: string
          p_key: string
          p_title: string
          p_year?: number
        }
        Returns: number
      }
      admin_user: { Args: { p_id: string }; Returns: Json }
      admin_user_row: { Args: { u: unknown }; Returns: Json }
      admin_users: {
        Args: {
          p_limit?: number
          p_page?: number
          p_q?: string
          p_role?: string
          p_status?: string
        }
        Returns: Json
      }
      advance_blind_rooms: { Args: never; Returns: undefined }
      advance_stations: { Args: never; Returns: number }
      blind_trial_json: {
        Args: { t: Database["public"]["Tables"]["blind_trials"]["Row"] }
        Returns: Json
      }
      claim_playback: { Args: { p_song_id: string }; Returns: Json }
      create_group: {
        Args: { p_name: string }
        Returns: {
          code: string
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "listening_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_artist: { Args: { p_name: string }; Returns: number }
      f_unaccent: { Args: { "": string }; Returns: string }
      get_meta: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_guest: { Args: never; Returns: boolean }
      join_group: {
        Args: { p_code: string }
        Returns: {
          code: string
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "listening_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      media_archive: { Args: { p_msg_id: number }; Returns: boolean }
      media_read: {
        Args: { p_count?: number; p_visibility_sec?: number }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_profile: {
        Args: never
        Returns: {
          address_detail: string | null
          avatar_url: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          id: string
          music_genres: string[]
          nickname: string | null
          phone: string | null
          province: string | null
          username: string | null
          ward: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_song: {
        Args: { p_song_id: string; p_station_id: number }
        Returns: number
      }
      review_song: {
        Args: { p_decision: string; p_note?: string; p_song_id: string }
        Returns: {
          album_title: string | null
          album_year: number | null
          artist_id: number
          attribution: string | null
          bpm: number | null
          country: string | null
          cover_color: string | null
          cover_path: string | null
          created_at: string
          duration_sec: number
          genre: string | null
          hls_path: string | null
          hls_tiers: number[]
          id: string
          license: string
          license_url: string | null
          likes_count: number
          loudness_lufs: number | null
          original_path: string | null
          plain_lyrics: string | null
          psl_mos: Json | null
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_text: string | null
          source_url: string
          status: Database["public"]["Enums"]["song_status"]
          synced_lyrics: string | null
          title: string
          uploaded_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "songs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      room_pool: {
        Args: { p_pattern?: string; p_pinned?: string[]; p_rules: Json }
        Returns: {
          album_title: string | null
          album_year: number | null
          artist_id: number
          attribution: string | null
          bpm: number | null
          country: string | null
          cover_color: string | null
          cover_path: string | null
          created_at: string
          duration_sec: number
          genre: string | null
          hls_path: string | null
          hls_tiers: number[]
          id: string
          license: string
          license_url: string | null
          likes_count: number
          loudness_lufs: number | null
          original_path: string | null
          plain_lyrics: string | null
          psl_mos: Json | null
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_text: string | null
          source_url: string
          status: Database["public"]["Enums"]["song_status"]
          synced_lyrics: string | null
          title: string
          uploaded_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "songs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_songs: {
        Args: { p_limit?: number; q: string }
        Returns: {
          album_title: string | null
          album_year: number | null
          artist_id: number
          attribution: string | null
          bpm: number | null
          country: string | null
          cover_color: string | null
          cover_path: string | null
          created_at: string
          duration_sec: number
          genre: string | null
          hls_path: string | null
          hls_tiers: number[]
          id: string
          license: string
          license_url: string | null
          likes_count: number
          loudness_lufs: number | null
          original_path: string | null
          plain_lyrics: string | null
          psl_mos: Json | null
          published_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_text: string | null
          source_url: string
          status: Database["public"]["Enums"]["song_status"]
          synced_lyrics: string | null
          title: string
          uploaded_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "songs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      server_now: { Args: never; Returns: string }
      stale_guest_ids: {
        Args: { p_days?: number; p_limit?: number }
        Returns: string[]
      }
      top_songs: {
        Args: { p_days?: number; p_group?: string; p_limit?: number }
        Returns: {
          listeners: number
          plays: number
          song_id: string
        }[]
      }
      vote_blind: {
        Args: { p_choice: string; p_trial_id: string }
        Returns: undefined
      }
    }
    Enums: {
      song_status:
        | "pending"
        | "processing"
        | "published"
        | "rejected"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      song_status: ["pending", "processing", "published", "rejected", "failed"],
    },
  },
} as const
