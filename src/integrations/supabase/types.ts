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
          created_at: string
          engagement_metrics: Json | null
          entities: Json | null
          id: string
          job_id: string
          keywords: string[] | null
          language: string | null
          sentiment: Database["public"]["Enums"]["sentiment_type"]
          sentiment_score: number | null
          summary: string | null
          topics: string[] | null
        }
        Insert: {
          created_at?: string
          engagement_metrics?: Json | null
          entities?: Json | null
          id?: string
          job_id: string
          keywords?: string[] | null
          language?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"]
          sentiment_score?: number | null
          summary?: string | null
          topics?: string[] | null
        }
        Update: {
          created_at?: string
          engagement_metrics?: Json | null
          entities?: Json | null
          id?: string
          job_id?: string
          keywords?: string[] | null
          language?: string | null
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
