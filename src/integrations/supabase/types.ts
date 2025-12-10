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
      api_clients: {
        Row: {
          allowed_endpoints: string[] | null
          api_key: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          rate_limit_per_minute: number
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          allowed_endpoints?: string[] | null
          api_key?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate_limit_per_minute?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          allowed_endpoints?: string[] | null
          api_key?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate_limit_per_minute?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          client_id: string | null
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          platform: Database["public"]["Enums"]["platform_type"]
          priority: number
          progress: number | null
          raw_content: string | null
          source_url: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["platform_type"]
          priority?: number
          progress?: number | null
          raw_content?: string | null
          source_url: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["platform_type"]
          priority?: number
          progress?: number | null
          raw_content?: string | null
          source_url?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: []
      }
      insights: {
        Row: {
          confidence_scores: Json | null
          created_at: string
          engagement_metrics: Json | null
          entities: Json | null
          id: string
          job_id: string
          keywords: string[] | null
          language: string | null
          ocr_text: string | null
          sentiment: Database["public"]["Enums"]["sentiment_type"]
          sentiment_score: number | null
          summary: string | null
          topics: string[] | null
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string
          engagement_metrics?: Json | null
          entities?: Json | null
          id?: string
          job_id: string
          keywords?: string[] | null
          language?: string | null
          ocr_text?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"]
          sentiment_score?: number | null
          summary?: string | null
          topics?: string[] | null
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string
          engagement_metrics?: Json | null
          entities?: Json | null
          id?: string
          job_id?: string
          keywords?: string[] | null
          language?: string | null
          ocr_text?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"]
          sentiment_score?: number | null
          summary?: string | null
          topics?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          job_id: string | null
          message: string
          metadata: Json | null
          stage: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          job_id?: string | null
          message: string
          metadata?: Json | null
          stage: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string | null
          message?: string
          metadata?: Json | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      log_api_usage: {
        Args: {
          p_client_id: string
          p_endpoint: string
          p_ip_address?: string
          p_method: string
          p_response_time_ms: number
          p_status_code: number
        }
        Returns: string
      }
      log_pipeline_event: {
        Args: {
          p_event_type: string
          p_job_id: string
          p_message: string
          p_metadata?: Json
          p_stage: string
        }
        Returns: string
      }
      validate_api_key: {
        Args: { p_api_key: string; p_endpoint: string }
        Returns: {
          client_id: string
          client_name: string
          is_valid: boolean
          rate_limit: number
        }[]
      }
    }
    Enums: {
      job_status:
        | "pending"
        | "ingesting"
        | "processing"
        | "enriching"
        | "completed"
        | "failed"
      platform_type:
        | "twitter"
        | "reddit"
        | "news"
        | "linkedin"
        | "instagram"
        | "youtube"
        | "custom"
      sentiment_type: "positive" | "negative" | "neutral" | "mixed"
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
      job_status: [
        "pending",
        "ingesting",
        "processing",
        "enriching",
        "completed",
        "failed",
      ],
      platform_type: [
        "twitter",
        "reddit",
        "news",
        "linkedin",
        "instagram",
        "youtube",
        "custom",
      ],
      sentiment_type: ["positive", "negative", "neutral", "mixed"],
    },
  },
} as const
