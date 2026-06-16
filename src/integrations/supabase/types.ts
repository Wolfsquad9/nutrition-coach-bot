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
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_summaries: {
        Row: {
          adherence_score: number | null
          client_id: string
          created_at: string
          created_by: string
          highlights: Json | null
          id: string
          model_version: string | null
          progress_trajectory: string | null
          raw_llm_response: Json | null
          recommendations: Json | null
          risk_flags: Json | null
          summary_text: string
          summary_type: string
          week_start_date: string
        }
        Insert: {
          adherence_score?: number | null
          client_id: string
          created_at?: string
          created_by: string
          highlights?: Json | null
          id?: string
          model_version?: string | null
          progress_trajectory?: string | null
          raw_llm_response?: Json | null
          recommendations?: Json | null
          risk_flags?: Json | null
          summary_text: string
          summary_type?: string
          week_start_date: string
        }
        Update: {
          adherence_score?: number | null
          client_id?: string
          created_at?: string
          created_by?: string
          highlights?: Json | null
          id?: string
          model_version?: string | null
          progress_trajectory?: string | null
          raw_llm_response?: Json | null
          recommendations?: Json | null
          risk_flags?: Json | null
          summary_text?: string
          summary_type?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_streaks: {
        Row: {
          client_id: string
          current_streak: number
          id: string
          last_checkin_date: string | null
          longest_streak: number
          streak_broken_date: string | null
          streak_start_date: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          current_streak?: number
          id?: string
          last_checkin_date?: string | null
          longest_streak?: number
          streak_broken_date?: string | null
          streak_start_date?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          current_streak?: number
          id?: string
          last_checkin_date?: string | null
          longest_streak?: number
          streak_broken_date?: string | null
          streak_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_streaks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_streaks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          client_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invite_token_hash: string
          invited_email: string | null
          revoked_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          invite_token_hash: string
          invited_email?: string | null
          revoked_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invite_token_hash?: string
          invited_email?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      client_progress_entries: {
        Row: {
          body_fat_pct: number | null
          client_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          nutrition_adherence_pct: number | null
          recorded_on: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          nutrition_adherence_pct?: number | null
          recorded_on: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          nutrition_adherence_pct?: number | null
          recorded_on?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_progress_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_progress_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      client_progress_snapshots: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          metrics: Json
          plan_version_id: string
          snapshot_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metrics: Json
          plan_version_id: string
          snapshot_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metrics?: Json
          plan_version_id?: string
          snapshot_type?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          activity_level: string | null
          allergies: string[] | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          diet_type: string | null
          dietary_restrictions: string[] | null
          disliked_foods: string[] | null
          email: string | null
          first_name: string | null
          follow_up_enabled: boolean
          gender: string | null
          height: number | null
          id: string
          last_name: string | null
          medical_conditions: string[] | null
          phone: string | null
          primary_goal: string | null
          training_experience: string | null
          training_frequency: number | null
          updated_at: string
          user_profile_id: string | null
          weight: number | null
        }
        Insert: {
          activity_level?: string | null
          allergies?: string[] | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          email?: string | null
          first_name?: string | null
          follow_up_enabled?: boolean
          gender?: string | null
          height?: number | null
          id?: string
          last_name?: string | null
          medical_conditions?: string[] | null
          phone?: string | null
          primary_goal?: string | null
          training_experience?: string | null
          training_frequency?: number | null
          updated_at?: string
          user_profile_id?: string | null
          weight?: number | null
        }
        Update: {
          activity_level?: string | null
          allergies?: string[] | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          email?: string | null
          first_name?: string | null
          follow_up_enabled?: boolean
          gender?: string | null
          height?: number | null
          id?: string
          last_name?: string | null
          medical_conditions?: string[] | null
          phone?: string | null
          primary_goal?: string | null
          training_experience?: string | null
          training_frequency?: number | null
          updated_at?: string
          user_profile_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_alerts: {
        Row: {
          alert_type: string
          client_id: string
          created_at: string
          dismissed: boolean
          id: string
          message: string
          metadata: Json | null
          read: boolean
          read_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          trainer_id: string
        }
        Insert: {
          alert_type: string
          client_id: string
          created_at?: string
          dismissed?: boolean
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          read_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title: string
          trainer_id: string
        }
        Update: {
          alert_type?: string
          client_id?: string
          created_at?: string
          dismissed?: boolean
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          read_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          trigger_event: string | null
          type: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          trigger_event?: string | null
          type?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          trigger_event?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          checkin_date: string
          client_id: string
          created_at: string
          created_by: string
          current_weight_kg: number | null
          energy_level: number | null
          id: string
          meal_adherence: number
          mood: number | null
          notes: string | null
          sleep_hours: number | null
          updated_at: string
          water_intake_liters: number | null
          workout_completed: boolean
        }
        Insert: {
          checkin_date: string
          client_id: string
          created_at?: string
          created_by: string
          current_weight_kg?: number | null
          energy_level?: number | null
          id?: string
          meal_adherence: number
          mood?: number | null
          notes?: string | null
          sleep_hours?: number | null
          updated_at?: string
          water_intake_liters?: number | null
          workout_completed?: boolean
        }
        Update: {
          checkin_date?: string
          client_id?: string
          created_at?: string
          created_by?: string
          current_weight_kg?: number | null
          energy_level?: number | null
          id?: string
          meal_adherence?: number
          mood?: number | null
          notes?: string | null
          sleep_hours?: number | null
          updated_at?: string
          water_intake_liters?: number | null
          workout_completed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "daily_checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          difficulty: string
          equipment: string[] | null
          id: string
          instructions: string[] | null
          is_compound: boolean | null
          muscle_groups: string[]
          name: string
          progression_metadata: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          difficulty: string
          equipment?: string[] | null
          id?: string
          instructions?: string[] | null
          is_compound?: boolean | null
          muscle_groups: string[]
          name: string
          progression_metadata?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          equipment?: string[] | null
          id?: string
          instructions?: string[] | null
          is_compound?: boolean | null
          muscle_groups?: string[]
          name?: string
          progression_metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      macro_tolerance_rules: {
        Row: {
          calories_pct_max: number
          carbs_pct_max: number
          created_at: string
          fats_pct_max: number
          id: string
          protein_pct_max: number
          scope: string
        }
        Insert: {
          calories_pct_max: number
          carbs_pct_max: number
          created_at?: string
          fats_pct_max: number
          id?: string
          protein_pct_max: number
          scope: string
        }
        Update: {
          calories_pct_max?: number
          carbs_pct_max?: number
          created_at?: string
          fats_pct_max?: number
          id?: string
          protein_pct_max?: number
          scope?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          achievements: boolean
          client_id: string
          meal_reminders: boolean
          progress_updates: boolean
          reminder_time: string
          scope: string
          updated_at: string
          workout_reminders: boolean
        }
        Insert: {
          achievements?: boolean
          client_id: string
          meal_reminders?: boolean
          progress_updates?: boolean
          reminder_time?: string
          scope?: string
          updated_at?: string
          workout_reminders?: boolean
        }
        Update: {
          achievements?: boolean
          client_id?: string
          meal_reminders?: boolean
          progress_updates?: boolean
          reminder_time?: string
          scope?: string
          updated_at?: string
          workout_reminders?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          client_id: string
          created_at: string
          icon: string
          id: string
          message: string
          read: boolean
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          icon?: string
          id?: string
          message: string
          read?: boolean
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          icon?: string
          id?: string
          message?: string
          read?: boolean
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      nutrition_plans: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          plan_data: Json
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id?: string
          plan_data: Json
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          plan_data?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_history: {
        Row: {
          event_type: string
          id: string
          modifications: Json | null
          plan_id: string
          plan_type: string
          timestamp: string
        }
        Insert: {
          event_type: string
          id?: string
          modifications?: Json | null
          plan_id: string
          plan_type: string
          timestamp?: string
        }
        Update: {
          event_type?: string
          id?: string
          modifications?: Json | null
          plan_id?: string
          plan_type?: string
          timestamp?: string
        }
        Relationships: []
      }
      plan_overrides: {
        Row: {
          approved_by: string | null
          archived: boolean
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          macro_delta: Json
          meal_type: string
          original_ingredient: string
          plan_version_id: string
          replacement_ingredient: string
          requires_recipe_regeneration: boolean
          suggested_by: string
          within_tolerance: boolean
        }
        Insert: {
          approved_by?: string | null
          archived?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          macro_delta: Json
          meal_type: string
          original_ingredient: string
          plan_version_id: string
          replacement_ingredient: string
          requires_recipe_regeneration?: boolean
          suggested_by: string
          within_tolerance?: boolean
        }
        Update: {
          approved_by?: string | null
          archived?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          macro_delta?: Json
          meal_type?: string
          original_ingredient?: string
          plan_version_id?: string
          replacement_ingredient?: string
          requires_recipe_regeneration?: boolean
          suggested_by?: string
          within_tolerance?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_overrides_plan_version_fk"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "client_visible_locked_plan_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "plan_overrides_plan_version_fk"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          locked_snapshot_json: Json | null
          note: string | null
          payload_hash: string
          plan_id: string
          plan_payload: Json
          version_number: number
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          locked_snapshot_json?: Json | null
          note?: string | null
          payload_hash: string
          plan_id: string
          plan_payload: Json
          version_number: number
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          locked_snapshot_json?: Json | null
          note?: string | null
          payload_hash?: string
          plan_id?: string
          plan_payload?: Json
          version_number?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          allergens: string[] | null
          category: string
          cook_time: number | null
          created_at: string
          diet_types: string[] | null
          id: string
          immutable: boolean
          ingredients: Json
          instructions: string[] | null
          macros: Json
          name: string
          prep_time: number | null
          updated_at: string
        }
        Insert: {
          allergens?: string[] | null
          category: string
          cook_time?: number | null
          created_at?: string
          diet_types?: string[] | null
          id?: string
          immutable?: boolean
          ingredients: Json
          instructions?: string[] | null
          macros: Json
          name: string
          prep_time?: number | null
          updated_at?: string
        }
        Update: {
          allergens?: string[] | null
          category?: string
          cook_time?: number | null
          created_at?: string
          diet_types?: string[] | null
          id?: string
          immutable?: boolean
          ingredients?: Json
          instructions?: string[] | null
          macros?: Json
          name?: string
          prep_time?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      training_plans: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          id: string
          plan_data: Json
          status: string
          updated_at: string
          weeks: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          plan_data: Json
          status?: string
          updated_at?: string
          weeks?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          plan_data?: Json
          status?: string
          updated_at?: string
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          adherence_score: number | null
          bodyweight_kg: number | null
          challenges: string | null
          chest_cm: number | null
          client_id: string
          coach_notes: string | null
          created_at: string
          created_by: string
          diet_satisfaction: number | null
          goals_for_next_week: string | null
          hip_cm: number | null
          id: string
          photo_urls: string[] | null
          updated_at: string
          waist_cm: number | null
          week_start_date: string
          wins: string | null
          workout_consistency: number | null
        }
        Insert: {
          adherence_score?: number | null
          bodyweight_kg?: number | null
          challenges?: string | null
          chest_cm?: number | null
          client_id: string
          coach_notes?: string | null
          created_at?: string
          created_by: string
          diet_satisfaction?: number | null
          goals_for_next_week?: string | null
          hip_cm?: number | null
          id?: string
          photo_urls?: string[] | null
          updated_at?: string
          waist_cm?: number | null
          week_start_date: string
          wins?: string | null
          workout_consistency?: number | null
        }
        Update: {
          adherence_score?: number | null
          bodyweight_kg?: number | null
          challenges?: string | null
          chest_cm?: number | null
          client_id?: string
          coach_notes?: string | null
          created_at?: string
          created_by?: string
          diet_satisfaction?: number | null
          goals_for_next_week?: string | null
          hip_cm?: number | null
          id?: string
          photo_urls?: string[] | null
          updated_at?: string
          waist_cm?: number | null
          week_start_date?: string
          wins?: string | null
          workout_consistency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_visible_locked_plan_versions: {
        Row: {
          client_id: string | null
          created_at: string | null
          locked_snapshot_json: Json | null
          payload_hash: string | null
          plan_id: string | null
          version_id: string | null
          version_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_trainer_view"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_trainer_view: {
        Row: {
          activity_level: string | null
          birth_date: string | null
          created_at: string | null
          created_by: string | null
          diet_type: string | null
          dietary_restrictions: string[] | null
          disliked_foods: string[] | null
          first_name: string | null
          gender: string | null
          height: number | null
          id: string | null
          last_name: string | null
          primary_goal: string | null
          training_experience: string | null
          training_frequency: number | null
          updated_at: string | null
          user_profile_id: string | null
          weight: number | null
        }
        Insert: {
          activity_level?: string | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          first_name?: string | null
          gender?: string | null
          height?: number | null
          id?: string | null
          last_name?: string | null
          primary_goal?: string | null
          training_experience?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          user_profile_id?: string | null
          weight?: number | null
        }
        Update: {
          activity_level?: string | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          first_name?: string | null
          gender?: string | null
          height?: number | null
          id?: string | null
          last_name?: string | null
          primary_goal?: string | null
          training_experience?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          user_profile_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_client_invitation: {
        Args: { p_invite_token_hash: string }
        Returns: string
      }
      create_client_invitation: {
        Args: {
          p_client_id: string
          p_expires_at?: string
          p_invite_token_hash: string
          p_invited_email: string
        }
        Returns: string
      }
      get_next_plan_version_number: {
        Args: { p_plan_id: string }
        Returns: number
      }
      get_trainer_client_ids: {
        Args: { _trainer_id: string }
        Returns: {
          client_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_v2: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_macro_delta_within_tolerance: {
        Args: { delta_macros: Json; scope: string; target_macros: Json }
        Returns: boolean
      }
      is_plan_locked: { Args: { plan_version_uuid: string }; Returns: boolean }
      lock_nutrition_plan: {
        Args: {
          p_client_id: string
          p_idempotency_key: string
          p_locked_snapshot_json: Json
          p_payload_hash: string
          p_plan_payload: Json
          p_version_id: string
        }
        Returns: {
          error: string
          plan_id: string
          success: boolean
          version_id: string
          version_number: number
        }[]
      }
    }
    Enums: {
      alert_severity: "green" | "yellow" | "red"
      app_role: "client" | "trainer" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alert_severity: ["green", "yellow", "red"],
      app_role: ["client", "trainer", "admin"],
    },
  },
} as const
