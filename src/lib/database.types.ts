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
