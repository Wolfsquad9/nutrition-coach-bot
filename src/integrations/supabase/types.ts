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
  public: {
    Tables: {
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
          activity_level: string
          allergies: string[] | null
          birth_date: string
          created_at: string
          diet_type: string | null
          dietary_restrictions: string[] | null
          disliked_foods: string[] | null
          gender: string
          height: number
          id: string
          medical_conditions: string[] | null
          primary_goal: string
          training_experience: string | null
          training_frequency: number | null
          updated_at: string
          user_profile_id: string | null
          weight: number
        }
        Insert: {
          activity_level: string
          allergies?: string[] | null
          birth_date: string
          created_at?: string
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          gender: string
          height: number
          id?: string
          medical_conditions?: string[] | null
          primary_goal: string
          training_experience?: string | null
          training_frequency?: number | null
          updated_at?: string
          user_profile_id?: string | null
          weight: number
        }
        Update: {
          activity_level?: string
          allergies?: string[] | null
          birth_date?: string
          created_at?: string
          diet_type?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          gender?: string
          height?: number
          id?: string
          medical_conditions?: string[] | null
          primary_goal?: string
          training_experience?: string | null
          training_frequency?: number | null
          updated_at?: string
          user_profile_id?: string | null
          weight?: number
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
            foreignKeyName: "training_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      is_macro_delta_within_tolerance: {
        Args: { delta_macros: Json; scope: string; target_macros: Json }
        Returns: boolean
      }
      is_plan_locked: { Args: { plan_version_uuid: string }; Returns: boolean }
    }
    Enums: {
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
  public: {
    Enums: {
      app_role: ["client", "trainer", "admin"],
    },
  },
} as const
