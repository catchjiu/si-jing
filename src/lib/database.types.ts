export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      comments: {
        Row: {
          commented_by: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          commented_by: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          commented_by?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_commented_by_fkey"
            columns: ["commented_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          id: string
          sent_by: string
          sent_to: string
          title: string | null
          message: string | null
          image_path: string
          task_id: string | null
          submission_id: string | null
          viewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          sent_by: string
          sent_to: string
          title?: string | null
          message?: string | null
          image_path: string
          task_id?: string | null
          submission_id?: string | null
          viewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          sent_by?: string
          sent_to?: string
          title?: string | null
          message?: string | null
          image_path?: string
          task_id?: string | null
          submission_id?: string | null
          viewed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_sent_to_fkey"
            columns: ["sent_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      punishments: {
        Row: {
          id: string
          issued_by: string
          issued_to: string
          punishment_type: string
          title: string | null
          reason: string | null
          duration_minutes: number
          starts_at: string
          ends_at: string
          status: string
          lifted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          issued_by: string
          issued_to: string
          punishment_type: string
          title?: string | null
          reason?: string | null
          duration_minutes: number
          starts_at?: string
          ends_at: string
          status?: string
          lifted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          issued_by?: string
          issued_to?: string
          punishment_type?: string
          title?: string | null
          reason?: string | null
          duration_minutes?: number
          starts_at?: string
          ends_at?: string
          status?: string
          lifted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "punishments_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punishments_issued_to_fkey"
            columns: ["issued_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          id: string
          requested_by: string
          request_type: string
          title: string
          message: string | null
          desire_level: number
          status: string
          queen_response: string | null
          responded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requested_by: string
          request_type?: string
          title: string
          message?: string | null
          desire_level: number
          status?: string
          queen_response?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requested_by?: string
          request_type?: string
          title?: string
          message?: string | null
          desire_level?: number
          status?: string
          queen_response?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      request_messages: {
        Row: {
          id: string
          request_id: string
          author_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          author_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tease_messages: {
        Row: {
          id: string
          tease_id: string
          author_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          tease_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          tease_id?: string
          author_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tease_messages_tease_id_fkey"
            columns: ["tease_id"]
            isOneToOne: false
            referencedRelation: "teases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tease_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          id: string
          created_by: string
          entity_type: string
          entity_id: string
          file_path: string
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          created_by: string
          entity_type: string
          entity_id: string
          file_path: string
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          entity_type?: string
          entity_id?: string
          file_path?: string
          duration_ms?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          id: string
          created_by: string
          title: string
          body: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          title: string
          body: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          title?: string
          body?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_acknowledgments: {
        Row: {
          id: string
          rule_id: string
          user_id: string
          acknowledged_at: string
        }
        Insert: {
          id?: string
          rule_id: string
          user_id: string
          acknowledged_at?: string
        }
        Update: {
          id?: string
          rule_id?: string
          user_id?: string
          acknowledged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_acknowledgments_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          id: string
          created_by: string
          assigned_to: string
          title: string
          prompt: string | null
          window_minutes: number
          opens_at: string
          closes_at: string
          status: string
          response_text: string | null
          responded_at: string | null
          pending_punishment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          created_by: string
          assigned_to: string
          title: string
          prompt?: string | null
          window_minutes: number
          opens_at: string
          closes_at: string
          status?: string
          response_text?: string | null
          responded_at?: string | null
          pending_punishment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          assigned_to?: string
          title?: string
          prompt?: string | null
          window_minutes?: number
          opens_at?: string
          closes_at?: string
          status?: string
          response_text?: string | null
          responded_at?: string | null
          pending_punishment_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_pending_punishment_id_fkey"
            columns: ["pending_punishment_id"]
            isOneToOne: false
            referencedRelation: "punishments"
            referencedColumns: ["id"]
          },
        ]
      }
      teases: {
        Row: {
          id: string
          sent_by: string
          sent_to: string
          title: string | null
          message: string | null
          image_path: string | null
          unlocks_at: string
          unlocked_notified_at: string | null
          viewed_at: string | null
          is_blurred: boolean
          blur_amount: number
          unblurred_at: string | null
          view_duration_seconds: number | null
          view_started_at: string | null
          expired_at: string | null
          screenshot_flagged_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          sent_by: string
          sent_to: string
          title?: string | null
          message?: string | null
          image_path?: string | null
          unlocks_at: string
          unlocked_notified_at?: string | null
          viewed_at?: string | null
          is_blurred?: boolean
          blur_amount?: number
          unblurred_at?: string | null
          view_duration_seconds?: number | null
          view_started_at?: string | null
          expired_at?: string | null
          screenshot_flagged_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          sent_by?: string
          sent_to?: string
          title?: string | null
          message?: string | null
          image_path?: string | null
          unlocks_at?: string
          unlocked_notified_at?: string | null
          viewed_at?: string | null
          is_blurred?: boolean
          blur_amount?: number
          unblurred_at?: string | null
          view_duration_seconds?: number | null
          view_started_at?: string | null
          expired_at?: string | null
          screenshot_flagged_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teases_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teases_sent_to_fkey"
            columns: ["sent_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rituals: {
        Row: {
          id: string
          created_by: string
          assigned_to: string
          name: string
          description: string | null
          schedule_kind: string
          time_of_day: string
          weekday: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          assigned_to: string
          name: string
          description?: string | null
          schedule_kind: string
          time_of_day?: string
          weekday?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          assigned_to?: string
          name?: string
          description?: string | null
          schedule_kind?: string
          time_of_day?: string
          weekday?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rituals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rituals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ritual_occurrences: {
        Row: {
          id: string
          ritual_id: string
          due_date: string
          status: string
          completed_at: string | null
          streak_at_completion: number | null
          created_at: string
        }
        Insert: {
          id?: string
          ritual_id: string
          due_date: string
          status?: string
          completed_at?: string | null
          streak_at_completion?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          ritual_id?: string
          due_date?: string
          status?: string
          completed_at?: string | null
          streak_at_completion?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ritual_occurrences_ritual_id_fkey"
            columns: ["ritual_id"]
            isOneToOne: false
            referencedRelation: "rituals"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_media: {
        Row: {
          file_path: string | null
          id: string
          media_type: string
          submission_id: string
          uploaded_at: string
          youtube_url: string | null
        }
        Insert: {
          file_path?: string | null
          id?: string
          media_type: string
          submission_id: string
          uploaded_at?: string
          youtube_url?: string | null
        }
        Update: {
          file_path?: string | null
          id?: string
          media_type?: string
          submission_id?: string
          uploaded_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_media_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          feedback: string | null
          id: string
          status: string
          submission_text: string | null
          submitted_at: string
          submitted_by: string
          task_id: string
        }
        Insert: {
          feedback?: string | null
          id?: string
          status?: string
          submission_text?: string | null
          submitted_at?: string
          submitted_by: string
          task_id: string
        }
        Update: {
          feedback?: string | null
          id?: string
          status?: string
          submission_text?: string | null
          submitted_at?: string
          submitted_by?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          created_at: string
          deadline: string
          description: string | null
          difficulty_level: string | null
          id: string
          is_recurring: boolean
          occurrence_key: string | null
          parent_task_id: string | null
          recurrence_pattern: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          created_at?: string
          deadline: string
          description?: string | null
          difficulty_level?: string | null
          id?: string
          is_recurring?: boolean
          occurrence_key?: string | null
          parent_task_id?: string | null
          recurrence_pattern?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          created_at?: string
          deadline?: string
          description?: string | null
          difficulty_level?: string | null
          id?: string
          is_recurring?: boolean
          occurrence_key?: string | null
          parent_task_id?: string | null
          recurrence_pattern?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          role: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          role: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: { Args: never; Returns: string }
      ensure_recurring_task_occurrences: {
        Args: { look_ahead_days?: number }
        Returns: number
      }
      complete_expired_punishments: { Args: never; Returns: number }
      has_active_contact_restriction: {
        Args: { target_id?: string }
        Returns: boolean
      }
      open_due_check_ins: { Args: never; Returns: number }
      flag_missed_check_ins: { Args: never; Returns: number }
      ensure_ritual_occurrences: {
        Args: { look_ahead_days?: number }
        Returns: number
      }
      flag_missed_rituals: { Args: never; Returns: number }
      ritual_streak: { Args: { p_ritual_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
