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
      access_code_attempts: {
        Row: {
          attempted_at: string
          id: number
          profile_id: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: number
          profile_id: string
          success: boolean
        }
        Update: {
          attempted_at?: string
          id?: number
          profile_id?: string
          success?: boolean
        }
        Relationships: []
      }
      access_code_redemptions: {
        Row: {
          code_id: string
          id: string
          profile_id: string
          redeemed_at: string
          subscription_id: string | null
        }
        Insert: {
          code_id: string
          id?: string
          profile_id: string
          redeemed_at?: string
          subscription_id?: string | null
        }
        Update: {
          code_id?: string
          id?: string
          profile_id?: string
          redeemed_at?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_codes: {
        Row: {
          active: boolean
          batch_label: string | null
          code: string
          created_at: string
          created_by: string | null
          duration_days: number
          expires_at: string | null
          id: string
          max_uses: number
          uses_count: number
        }
        Insert: {
          active?: boolean
          batch_label?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          duration_days: number
          expires_at?: string | null
          id?: string
          max_uses?: number
          uses_count?: number
        }
        Update: {
          active?: boolean
          batch_label?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          expires_at?: string | null
          id?: string
          max_uses?: number
          uses_count?: number
        }
        Relationships: []
      }
      application_items: {
        Row: {
          last_ai_review_id: string | null
          document_id: string | null
          document_type: string | null
          recommenders_count: number | null
          application_id: string
          completed_at: string | null
          description: string | null
          due_date: string | null
          essay_draft: string | null
          essay_draft_saved_at: string | null
          essay_max_words: number | null
          essay_prompt: string | null
          id: string
          kind: Database["public"]["Enums"]["requirement_kind"]
          label: string
          requirement_id: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["item_status"]
        }
        Insert: {
          last_ai_review_id?: string | null
          document_id?: string | null
          document_type?: string | null
          recommenders_count?: number | null
          application_id: string
          completed_at?: string | null
          description?: string | null
          due_date?: string | null
          essay_draft?: string | null
          essay_draft_saved_at?: string | null
          essay_max_words?: number | null
          essay_prompt?: string | null
          id?: string
          kind: Database["public"]["Enums"]["requirement_kind"]
          label: string
          requirement_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["item_status"]
        }
        Update: {
          last_ai_review_id?: string | null
          document_id?: string | null
          document_type?: string | null
          recommenders_count?: number | null
          application_id?: string
          completed_at?: string | null
          description?: string | null
          due_date?: string | null
          essay_draft?: string | null
          essay_draft_saved_at?: string | null
          essay_max_words?: number | null
          essay_prompt?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["requirement_kind"]
          label?: string
          requirement_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "application_items_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_items_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "bourse_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          bourse_id: string
          created_at: string
          deadline: string | null
          id: string
          last_activity_at: string
          next_action: string | null
          next_item_id: string | null
          outcome_note: string | null
          profile_id: string
          readiness: number
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          bourse_id: string
          created_at?: string
          deadline?: string | null
          id?: string
          last_activity_at?: string
          next_action?: string | null
          next_item_id?: string | null
          outcome_note?: string | null
          profile_id: string
          readiness?: number
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          bourse_id?: string
          created_at?: string
          deadline?: string | null
          id?: string
          last_activity_at?: string
          next_action?: string | null
          next_item_id?: string | null
          outcome_note?: string | null
          profile_id?: string
          readiness?: number
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_bourse_id_fkey"
            columns: ["bourse_id"]
            isOneToOne: false
            referencedRelation: "bourses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threads: {
        Row: {
          application_id: string | null
          created_at: string
          feature: Database["public"]["Enums"]["ai_feature"]
          id: string
          profile_id: string
          state: Json | null
          title: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          feature: Database["public"]["Enums"]["ai_feature"]
          id?: string
          profile_id: string
          state?: Json | null
          title?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string
          feature?: Database["public"]["Enums"]["ai_feature"]
          id?: string
          profile_id?: string
          state?: Json | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_threads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          application_id: string | null
          cached_tokens: number | null
          cost_usd: number | null
          created_at: string
          feature: Database["public"]["Enums"]["ai_feature"]
          id: string
          input_tokens: number | null
          item_id: string | null
          model: string
          output_tokens: number | null
          profile_id: string
          result: Json | null
          thread_id: string | null
        }
        Insert: {
          application_id?: string | null
          cached_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          feature: Database["public"]["Enums"]["ai_feature"]
          id?: string
          input_tokens?: number | null
          item_id?: string | null
          model: string
          output_tokens?: number | null
          profile_id: string
          result?: Json | null
          thread_id?: string | null
        }
        Update: {
          application_id?: string | null
          cached_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          feature?: Database["public"]["Enums"]["ai_feature"]
          id?: string
          input_tokens?: number | null
          item_id?: string | null
          model?: string
          output_tokens?: number | null
          profile_id?: string
          result?: Json | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      bourse_requirements: {
        Row: {
          bourse_id: string
          days_before_deadline: number | null
          description: string | null
          document_type: string | null
          essay_language: string | null
          essay_max_words: number | null
          essay_prompt: string | null
          id: string
          kind: Database["public"]["Enums"]["requirement_kind"]
          label: string
          recommenders_count: number | null
          sort_order: number
        }
        Insert: {
          bourse_id: string
          days_before_deadline?: number | null
          description?: string | null
          document_type?: string | null
          essay_language?: string | null
          essay_max_words?: number | null
          essay_prompt?: string | null
          id?: string
          kind: Database["public"]["Enums"]["requirement_kind"]
          label: string
          recommenders_count?: number | null
          sort_order: number
        }
        Update: {
          bourse_id?: string
          days_before_deadline?: number | null
          description?: string | null
          document_type?: string | null
          essay_language?: string | null
          essay_max_words?: number | null
          essay_prompt?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["requirement_kind"]
          label?: string
          recommenders_count?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bourse_requirements_bourse_id_fkey"
            columns: ["bourse_id"]
            isOneToOne: false
            referencedRelation: "bourses"
            referencedColumns: ["id"]
          },
        ]
      }
      bourses: {
        Row: {
          essay_criteria: Json | null
          interview_format: string | null
          operations_order: Json | null
          video_url: string | null
          whatsapp_group_url: string | null
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
          essay_criteria?: Json | null
          interview_format?: string | null
          operations_order?: Json | null
          video_url?: string | null
          whatsapp_group_url?: string | null
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
          essay_criteria?: Json | null
          interview_format?: string | null
          operations_order?: Json | null
          video_url?: string | null
          whatsapp_group_url?: string | null
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
      documents: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          label: string
          mime_type: string
          pages: number | null
          processed: boolean
          profile_id: string
          size_bytes: number | null
          source: string | null
          storage_path: string
          type: Database["public"]["Enums"]["document_type"]
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          label: string
          mime_type: string
          pages?: number | null
          processed?: boolean
          profile_id: string
          size_bytes?: number | null
          source?: string | null
          storage_path: string
          type: Database["public"]["Enums"]["document_type"]
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          mime_type?: string
          pages?: number | null
          processed?: boolean
          profile_id?: string
          size_bytes?: number | null
          source?: string | null
          storage_path?: string
          type?: Database["public"]["Enums"]["document_type"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          application_id: string | null
          installments: number
          paid_amount: number
          credit_applied: number
          second_due_at: string | null
          reminder_t2_j5_sent: boolean
          reminder_t2_j1_sent: boolean
          reminder_t2_j0_sent: boolean
          reminder_t2_jp3_sent: boolean
          assigned_agent: string | null
          amount: number
          bourse_id: string | null
          created_at: string
          deadline: string | null
          id: string
          notes: string | null
          package_type: string | null
          profile_id: string
          status: Database["public"]["Enums"]["engagement_status"]
          university: string | null
          updated_at: string
          window_year: number | null
        }
        Insert: {
          application_id?: string | null
          installments?: number
          paid_amount?: number
          credit_applied?: number
          second_due_at?: string | null
          reminder_t2_j5_sent?: boolean
          reminder_t2_j1_sent?: boolean
          reminder_t2_j0_sent?: boolean
          reminder_t2_jp3_sent?: boolean
          assigned_agent?: string | null
          amount: number
          bourse_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          notes?: string | null
          package_type?: string | null
          profile_id: string
          status?: Database["public"]["Enums"]["engagement_status"]
          university?: string | null
          updated_at?: string
          window_year?: number | null
        }
        Update: {
          application_id?: string | null
          installments?: number
          paid_amount?: number
          credit_applied?: number
          second_due_at?: string | null
          reminder_t2_j5_sent?: boolean
          reminder_t2_j1_sent?: boolean
          reminder_t2_j0_sent?: boolean
          reminder_t2_jp3_sent?: boolean
          assigned_agent?: string | null
          amount?: number
          bourse_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          notes?: string | null
          package_type?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          university?: string | null
          updated_at?: string
          window_year?: number | null
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
      knowledge_chunks: {
        Row: {
          content: string
          id: string
          ref: string
          source: string
          title: string
          tsv: unknown
          updated_at: string
        }
        Insert: {
          content: string
          id?: string
          ref: string
          source: string
          title: string
          tsv?: unknown
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          ref?: string
          source?: string
          title?: string
          tsv?: unknown
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          send_after: string
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
          send_after?: string
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
          send_after?: string
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
          checkout_url: string | null
          external_id: string | null
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
          checkout_url?: string | null
          external_id?: string | null
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
          checkout_url?: string | null
          external_id?: string | null
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
          timezone: string
          referral_code: string | null
          referred_by: string | null
          is_ambassador: boolean
          onboarding_completed: boolean
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
          timezone?: string
          referral_code?: string | null
          referred_by?: string | null
          is_ambassador?: boolean
          onboarding_completed?: boolean
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
          timezone?: string
          referral_code?: string | null
          referred_by?: string | null
          is_ambassador?: boolean
          onboarding_completed?: boolean
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
      recommenders: {
        Row: {
          application_id: string | null
          auto_remind: boolean
          created_at: string
          document_id: string | null
          email: string | null
          full_name: string
          id: string
          institution: string | null
          notes: string | null
          phone: string | null
          profile_id: string
          received_at: string | null
          relation: string | null
          reminded_at: string | null
          requested_at: string | null
          status: Database["public"]["Enums"]["recommender_status"]
          strengths: string | null
          title: string | null
        }
        Insert: {
          application_id?: string | null
          auto_remind?: boolean
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          institution?: string | null
          notes?: string | null
          phone?: string | null
          profile_id: string
          received_at?: string | null
          relation?: string | null
          reminded_at?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["recommender_status"]
          strengths?: string | null
          title?: string | null
        }
        Update: {
          application_id?: string | null
          auto_remind?: boolean
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          institution?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string
          received_at?: string | null
          relation?: string | null
          reminded_at?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["recommender_status"]
          strengths?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommenders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommenders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommenders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          paid_at: string | null
          referred_id: string
          referrer_id: string
          reward_subscription_id: string | null
          rewarded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          paid_at?: string | null
          referred_id: string
          referrer_id: string
          reward_subscription_id?: string | null
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          paid_at?: string | null
          referred_id?: string
          referrer_id?: string
          reward_subscription_id?: string | null
          rewarded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          payment_id: string | null
          source: string
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
          payment_id?: string | null
          source?: string
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
          payment_id?: string | null
          source?: string
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
      search_knowledge: {
        Args: { _limit?: number; _query: string }
        Returns: { content: string; rank: number; ref: string; source: string; title: string }[]
      }
      redeem_access_code: {
        Args: { _code: string; _profile_id: string }
        Returns: { duration_days: number; redemption_id: string }[]
      }
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
      ai_feature: "essay_review" | "cv_review" | "interview_sim" | "coach_chat" | "doc_classify"
      app_role: "admin" | "moderator" | "user"
      application_status:
        | "targeting"
        | "preparing"
        | "ready"
        | "submitted"
        | "interview"
        | "accepted"
        | "rejected"
        | "abandoned"
      document_type:
        | "passport"
        | "id_card"
        | "birth_certificate"
        | "photo_id"
        | "diploma_bac"
        | "diploma_licence"
        | "diploma_master"
        | "transcript"
        | "cv"
        | "motivation_letter"
        | "recommendation_letter"
        | "english_test"
        | "proof_of_income"
        | "proof_of_residence"
        | "other"
      item_status: "todo" | "in_progress" | "done" | "na"
      recommender_status: "to_contact" | "requested" | "reminded" | "received" | "declined"
      requirement_kind:
        | "document"
        | "essay"
        | "recommendation"
        | "form"
        | "test"
        | "other"
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
        | "maketou"
        | "promo"
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
      ai_feature: ["essay_review", "cv_review", "interview_sim", "coach_chat", "doc_classify"],
      app_role: ["admin", "moderator", "user"],
      application_status: [
        "targeting",
        "preparing",
        "ready",
        "submitted",
        "interview",
        "accepted",
        "rejected",
        "abandoned",
      ],
      document_type: [
        "passport",
        "id_card",
        "birth_certificate",
        "photo_id",
        "diploma_bac",
        "diploma_licence",
        "diploma_master",
        "transcript",
        "cv",
        "motivation_letter",
        "recommendation_letter",
        "english_test",
        "proof_of_income",
        "proof_of_residence",
        "other",
      ],
      item_status: ["todo", "in_progress", "done", "na"],
      recommender_status: ["to_contact", "requested", "reminded", "received", "declined"],
      requirement_kind: ["document", "essay", "recommendation", "form", "test", "other"],
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
        "maketou",
        "promo",
      ],
      payment_status: ["pending", "success", "failed", "refunded"],
      subscription_plan: ["monthly", "quarterly"],
      subscription_status: ["active", "grace", "expired", "cancelled"],
    },
  },
} as const
