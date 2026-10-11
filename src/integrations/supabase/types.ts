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
      alerts_log: {
        Row: {
          bourse_id: string
          channel: string
          id: string
          profile_id: string
          sent_at: string
        }
        Insert: {
          bourse_id: string
          channel: string
          id?: string
          profile_id: string
          sent_at?: string
        }
        Update: {
          bourse_id?: string
          channel?: string
          id?: string
          profile_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_log_bourse_id_fkey"
            columns: ["bourse_id"]
            isOneToOne: false
            referencedRelation: "bourses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bourses: {
        Row: {
          academic_year: number | null
          country: string
          eligible_nationalities: string[]
          english_required: boolean
          financial_need_required: boolean
          gender_restriction: string
          id: string
          max_age: number | null
          min_education: string | null
          notes: string | null
          program_url: string | null
          university_name: string
          updated_at: string
          window_closes: string | null
          window_confirmed: boolean
          window_opens: string | null
        }
        Insert: {
          academic_year?: number | null
          country: string
          eligible_nationalities?: string[]
          english_required?: boolean
          financial_need_required?: boolean
          gender_restriction?: string
          id: string
          max_age?: number | null
          min_education?: string | null
          notes?: string | null
          program_url?: string | null
          university_name: string
          updated_at?: string
          window_closes?: string | null
          window_confirmed?: boolean
          window_opens?: string | null
        }
        Update: {
          academic_year?: number | null
          country?: string
          eligible_nationalities?: string[]
          english_required?: boolean
          financial_need_required?: boolean
          gender_restriction?: string
          id?: string
          max_age?: number | null
          min_education?: string | null
          notes?: string | null
          program_url?: string | null
          university_name?: string
          updated_at?: string
          window_closes?: string | null
          window_confirmed?: boolean
          window_opens?: string | null
        }
        Relationships: []
      }
      engagements: {
        Row: {
          amount: number
          bourse_id: string | null
          created_at: string
          deadline: string | null
          id: string
          notes: string | null
          package_type: string | null
          profile_id: string
          status: Database["public"]["Enums"]["engagement_status"]
          university: string
          updated_at: string
          window_year: number
        }
        Insert: {
          amount: number
          bourse_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          notes?: string | null
          package_type?: string | null
          profile_id: string
          status?: Database["public"]["Enums"]["engagement_status"]
          university: string
          updated_at?: string
          window_year: number
        }
        Update: {
          amount?: number
          bourse_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          notes?: string | null
          package_type?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          university?: string
          updated_at?: string
          window_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "engagements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_sessions: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          profile_id: string
          revoked: boolean
          session_token: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          profile_id: string
          revoked?: boolean
          session_token: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          profile_id?: string
          revoked?: boolean
          session_token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          dedupe_key: string
          error: string | null
          id: string
          kind: string
          profile_id: string
          recipient: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          dedupe_key: string
          error?: string | null
          id?: string
          kind: string
          profile_id: string
          recipient?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          dedupe_key?: string
          error?: string | null
          id?: string
          kind?: string
          profile_id?: string
          recipient?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          paid_at: string | null
          payable_id: string | null
          payable_type: Database["public"]["Enums"]["payable_type"]
          profile_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          status: Database["public"]["Enums"]["payment_status"]
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          payable_id?: string | null
          payable_type: Database["public"]["Enums"]["payable_type"]
          profile_id: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          payable_id?: string | null
          payable_type?: Database["public"]["Enums"]["payable_type"]
          profile_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          created_at: string
          credit_balance: number
          date_of_birth: string | null
          education: string | null
          email: string | null
          email_optin: boolean
          english_level: string | null
          field_of_study: string | null
          financial_need: boolean
          full_name: string
          gender: string | null
          id: string
          member_code: string
          nationality: string | null
          phone: string | null
          residence: string | null
          updated_at: string
          whatsapp_optin: boolean
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          credit_balance?: number
          date_of_birth?: string | null
          education?: string | null
          email?: string | null
          email_optin?: boolean
          english_level?: string | null
          field_of_study?: string | null
          financial_need?: boolean
          full_name?: string
          gender?: string | null
          id?: string
          member_code?: string
          nationality?: string | null
          phone?: string | null
          residence?: string | null
          updated_at?: string
          whatsapp_optin?: boolean
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          credit_balance?: number
          date_of_birth?: string | null
          education?: string | null
          email?: string | null
          email_optin?: boolean
          english_level?: string | null
          field_of_study?: string | null
          financial_need?: boolean
          full_name?: string
          gender?: string | null
          id?: string
          member_code?: string
          nationality?: string | null
          phone?: string | null
          residence?: string | null
          updated_at?: string
          whatsapp_optin?: boolean
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          ends_at: string
          grace_ends_at: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          profile_id: string
          reminder_grace_sent: boolean
          reminder_j0_sent: boolean
          reminder_j2_sent: boolean
          reminder_j7_sent: boolean
          starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          ends_at: string
          grace_ends_at?: string | null
          id?: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          profile_id: string
          reminder_grace_sent?: boolean
          reminder_j0_sent?: boolean
          reminder_j2_sent?: boolean
          reminder_j7_sent?: boolean
          starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          ends_at?: string
          grace_ends_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          profile_id?: string
          reminder_grace_sent?: boolean
          reminder_j0_sent?: boolean
          reminder_j2_sent?: boolean
          reminder_j7_sent?: boolean
          starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      verify_cron_token: { Args: { _token: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      engagement_status:
        | "pending_payment"
        | "active"
        | "documents_review"
        | "submitted"
        | "completed"
        | "cancelled"
      payable_type: "subscription" | "engagement"
      payment_provider:
        | "wave"
        | "orange_money"
        | "mtn_momo"
        | "moov_money"
        | "manual"
      payment_status: "pending" | "success" | "failed" | "refunded"
      subscription_plan: "monthly" | "quarterly"
      subscription_status: "active" | "grace" | "expired" | "cancelled"
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
      app_role: ["admin", "moderator", "user"],
      engagement_status: [
        "pending_payment",
        "active",
        "documents_review",
        "submitted",
        "completed",
        "cancelled",
      ],
      payable_type: ["subscription", "engagement"],
      payment_provider: [
        "wave",
        "orange_money",
        "mtn_momo",
        "moov_money",
        "manual",
      ],
      payment_status: ["pending", "success", "failed", "refunded"],
      subscription_plan: ["monthly", "quarterly"],
      subscription_status: ["active", "grace", "expired", "cancelled"],
    },
  },
} as const
