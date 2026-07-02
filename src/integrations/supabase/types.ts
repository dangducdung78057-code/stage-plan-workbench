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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      confirmation_records: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          notes: string | null
          project_id: string
          snapshot_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          snapshot_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          snapshot_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "confirmation_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmation_records_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "plan_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      export_records: {
        Row: {
          created_at: string
          format: string
          id: string
          payload: string
          project_id: string
          snapshot_id: string | null
          user_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          format: string
          id?: string
          payload: string
          project_id: string
          snapshot_id?: string | null
          user_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          payload?: string
          project_id?: string
          snapshot_id?: string | null
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "export_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_records_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "plan_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check_runs: {
        Row: {
          baseline: string
          created_at: string
          fail_count: number
          id: string
          is_release: boolean
          items: Json
          pass_count: number
          release_note: string | null
          released_at: string | null
          route: string | null
          skip_count: number
          summary: Json
          user_agent: string | null
          user_id: string
          warn_count: number
        }
        Insert: {
          baseline: string
          created_at?: string
          fail_count?: number
          id?: string
          is_release?: boolean
          items?: Json
          pass_count?: number
          release_note?: string | null
          released_at?: string | null
          route?: string | null
          skip_count?: number
          summary?: Json
          user_agent?: string | null
          user_id: string
          warn_count?: number
        }
        Update: {
          baseline?: string
          created_at?: string
          fail_count?: number
          id?: string
          is_release?: boolean
          items?: Json
          pass_count?: number
          release_note?: string | null
          released_at?: string | null
          route?: string | null
          skip_count?: number
          summary?: Json
          user_agent?: string | null
          user_id?: string
          warn_count?: number
        }
        Relationships: []
      }
      plan_snapshots: {
        Row: {
          costume_plan: Json
          generated_at: string
          id: string
          mode: string
          platform_search: Json
          project_id: string
          provider_status: string | null
          reverse_schedule: Json
          risks: Json
          user_id: string | null
          version: number
        }
        Insert: {
          costume_plan?: Json
          generated_at?: string
          id?: string
          mode?: string
          platform_search?: Json
          project_id: string
          provider_status?: string | null
          reverse_schedule?: Json
          risks?: Json
          user_id?: string | null
          version?: number
        }
        Update: {
          costume_plan?: Json
          generated_at?: string
          id?: string
          mode?: string
          platform_search?: Json
          project_id?: string
          provider_status?: string | null
          reverse_schedule?: Json
          risks?: Json
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          performance_date: string | null
          performer_count: number | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          performance_date?: string | null
          performer_count?: number | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          performance_date?: string | null
          performer_count?: number | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      release_freezes: {
        Row: {
          baseline: string
          capability_snapshot: Json
          created_at: string
          created_by: string | null
          gate: string
          id: string
          reason: string | null
          rule: string | null
          status: string
        }
        Insert: {
          baseline: string
          capability_snapshot: Json
          created_at?: string
          created_by?: string | null
          gate: string
          id?: string
          reason?: string | null
          rule?: string | null
          status: string
        }
        Update: {
          baseline?: string
          capability_snapshot?: Json
          created_at?: string
          created_by?: string | null
          gate?: string
          id?: string
          reason?: string | null
          rule?: string | null
          status?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          api_base_url: string | null
          api_mode: string
          id: string
          procurement_api_base_url: string | null
          procurement_candidates_enabled: boolean
          procurement_export_attachment_enabled: boolean
          procurement_provider: string
          procurement_provider_enabled: boolean
          updated_at: string
          webhook_enabled: boolean
          webhook_events: string[]
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_mode?: string
          id: string
          procurement_api_base_url?: string | null
          procurement_candidates_enabled?: boolean
          procurement_export_attachment_enabled?: boolean
          procurement_provider?: string
          procurement_provider_enabled?: boolean
          updated_at?: string
          webhook_enabled?: boolean
          webhook_events?: string[]
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_mode?: string
          id?: string
          procurement_api_base_url?: string | null
          procurement_candidates_enabled?: boolean
          procurement_export_attachment_enabled?: boolean
          procurement_provider?: string
          procurement_provider_enabled?: boolean
          updated_at?: string
          webhook_enabled?: boolean
          webhook_events?: string[]
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      stage_inputs: {
        Row: {
          data: Json
          project_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          data?: Json
          project_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          data?: Json
          project_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_inputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_capabilities: {
        Row: {
          enabled: boolean
          layer: string
          module: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          layer: string
          module: string
          notes?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          layer?: string
          module?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_delivery_logs: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          event: string
          http_status: number | null
          id: string
          payload: Json | null
          project_id: string | null
          status: string
          url: string
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          event: string
          http_status?: number | null
          id?: string
          payload?: Json | null
          project_id?: string | null
          status: string
          url: string
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          event?: string
          http_status?: number | null
          id?: string
          payload?: Json | null
          project_id?: string | null
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_webhook_secret: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      set_webhook_secret: { Args: { _secret: string }; Returns: undefined }
      sync_pdf_capability: {
        Args: { p_enabled: boolean; p_notes: string; p_status: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
