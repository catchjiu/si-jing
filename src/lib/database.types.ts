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
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          location_source: string | null
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
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
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
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
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
      worship_entries: {
        Row: {
          id: string
          gallery_id: string
          created_by: string
          title: string | null
          description: string | null
          image_path: string
          media_kind: string
          storage_bucket: string
          source_type: string | null
          source_id: string | null
          love_level: number
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          location_source: string | null
          viewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          gallery_id: string
          created_by: string
          title?: string | null
          description?: string | null
          image_path: string
          media_kind?: string
          storage_bucket?: string
          source_type?: string | null
          source_id?: string | null
          love_level?: number
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
          viewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          gallery_id?: string
          created_by?: string
          title?: string | null
          description?: string | null
          image_path?: string
          media_kind?: string
          storage_bucket?: string
          source_type?: string | null
          source_id?: string | null
          love_level?: number
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
          viewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worship_entries_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "worship_galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_galleries: {
        Row: {
          id: string
          created_by: string
          topic: string
          description: string | null
          viewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          topic: string
          description?: string | null
          viewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          topic?: string
          description?: string | null
          viewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_galleries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_gallery_messages: {
        Row: {
          id: string
          gallery_id: string
          author_id: string
          content: string | null
          image_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          gallery_id: string
          author_id: string
          content?: string | null
          image_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          gallery_id?: string
          author_id?: string
          content?: string | null
          image_path?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_gallery_messages_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "worship_galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worship_gallery_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_messages: {
        Row: {
          id: string
          worship_id: string
          author_id: string
          content: string | null
          image_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          worship_id: string
          author_id: string
          content?: string | null
          image_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          worship_id?: string
          author_id?: string
          content?: string | null
          image_path?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_messages_worship_id_fkey"
            columns: ["worship_id"]
            isOneToOne: false
            referencedRelation: "worship_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worship_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          id: string
          created_by: string
          item_kind: string
          title: string | null
          notes: string | null
          link_url: string | null
          image_path: string
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          location_source: string | null
          created_at: string
          status: string
          seen_at: string | null
          fulfillment_notes: string | null
          fulfilled_at: string | null
          purchase_price_usd: number | null
          purchased_at: string | null
          arrived_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          item_kind?: string
          title?: string | null
          notes?: string | null
          link_url?: string | null
          image_path: string
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
          created_at?: string
          status?: string
          seen_at?: string | null
          fulfillment_notes?: string | null
          fulfilled_at?: string | null
          purchase_price_usd?: number | null
          purchased_at?: string | null
          arrived_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          item_kind?: string
          title?: string | null
          notes?: string | null
          link_url?: string | null
          image_path?: string
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
          created_at?: string
          status?: string
          seen_at?: string | null
          fulfillment_notes?: string | null
          fulfilled_at?: string | null
          purchase_price_usd?: number | null
          purchased_at?: string | null
          arrived_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_budget_accounts: {
        Row: {
          user_id: string
          credit_usd_cents: number
          credit_item_credits: number
          weekly_usd_limit_cents: number
          weekly_item_limit: number
          updated_at: string
        }
        Insert: {
          user_id: string
          credit_usd_cents?: number
          credit_item_credits?: number
          weekly_usd_limit_cents?: number
          weekly_item_limit?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          credit_usd_cents?: number
          credit_item_credits?: number
          weekly_usd_limit_cents?: number
          weekly_item_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_budget_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_purchases: {
        Row: {
          id: string
          user_id: string
          wishlist_item_id: string
          price_usd_cents: number
          week_start: string
          from_weekly_usd_cents: number
          from_credit_usd_cents: number
          from_weekly_items: number
          from_credit_items: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          wishlist_item_id: string
          price_usd_cents: number
          week_start: string
          from_weekly_usd_cents?: number
          from_credit_usd_cents?: number
          from_weekly_items?: number
          from_credit_items?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          wishlist_item_id?: string
          price_usd_cents?: number
          week_start?: string
          from_weekly_usd_cents?: number
          from_credit_usd_cents?: number
          from_weekly_items?: number
          from_credit_items?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_purchases_wishlist_item_id_fkey"
            columns: ["wishlist_item_id"]
            isOneToOne: true
            referencedRelation: "wishlist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_messages: {
        Row: {
          id: string
          wishlist_id: string
          author_id: string
          content: string | null
          image_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          wishlist_id: string
          author_id: string
          content?: string | null
          image_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          wishlist_id?: string
          author_id?: string
          content?: string | null
          image_path?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_messages_wishlist_id_fkey"
            columns: ["wishlist_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_messages: {
        Row: {
          id: string
          reward_id: string
          author_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          reward_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          reward_id?: string
          author_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_messages_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_messages_author_id_fkey"
            columns: ["author_id"]
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
          config: Record<string, unknown>
          acknowledged_at: string | null
          clearance_mode: string
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
          config?: Record<string, unknown>
          acknowledged_at?: string | null
          clearance_mode?: string
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
          config?: Record<string, unknown>
          acknowledged_at?: string | null
          clearance_mode?: string
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
          image_path: string | null
          desire_level: number
          status: string
          queen_response: string | null
          responded_at: string | null
          created_at: string
          updated_at: string
          direction: string
          assigned_to: string | null
          slave_response: string | null
          slave_responded_at: string | null
        }
        Insert: {
          id?: string
          requested_by: string
          request_type?: string
          title: string
          message?: string | null
          image_path?: string | null
          desire_level: number
          status?: string
          queen_response?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
          direction?: string
          assigned_to?: string | null
          slave_response?: string | null
          slave_responded_at?: string | null
        }
        Update: {
          id?: string
          requested_by?: string
          request_type?: string
          title?: string
          message?: string | null
          image_path?: string | null
          desire_level?: number
          status?: string
          queen_response?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
          direction?: string
          assigned_to?: string | null
          slave_response?: string | null
          slave_responded_at?: string | null
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
      tease_view_captures: {
        Row: {
          id: string
          tease_id: string
          viewer_id: string
          video_path: string
          duration_ms: number | null
          watch_metric: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tease_id: string
          viewer_id: string
          video_path: string
          duration_ms?: number | null
          watch_metric?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tease_id?: string
          viewer_id?: string
          video_path?: string
          duration_ms?: number | null
          watch_metric?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tease_view_captures_tease_id_fkey"
            columns: ["tease_id"]
            isOneToOne: false
            referencedRelation: "teases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tease_view_captures_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tease_unlock_tasks: {
        Row: {
          id: string
          tease_id: string
          sort_order: number
          label: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tease_id: string
          sort_order: number
          label: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tease_id?: string
          sort_order?: number
          label?: string
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tease_unlock_tasks_tease_id_fkey"
            columns: ["tease_id"]
            isOneToOne: false
            referencedRelation: "teases"
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
      queen_dates: {
        Row: {
          id: string
          created_by: string
          assigned_to: string
          title: string | null
          notes: string | null
          scheduled_at: string
          thoughts_text: string | null
          arousal_level: number | null
          jealousy_level: number | null
          youtube_url: string | null
          reacted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          created_by: string
          assigned_to: string
          title?: string | null
          notes?: string | null
          scheduled_at: string
          thoughts_text?: string | null
          arousal_level?: number | null
          jealousy_level?: number | null
          youtube_url?: string | null
          reacted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          assigned_to?: string
          title?: string | null
          notes?: string | null
          scheduled_at?: string
          thoughts_text?: string | null
          arousal_level?: number | null
          jealousy_level?: number | null
          youtube_url?: string | null
          reacted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queen_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queen_dates_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_pins: {
        Row: {
          id: string
          pinned_by: string
          source_type: string
          source_id: string
          media_kind: string
          title: string
          caption: string | null
          youtube_url: string | null
          file_path: string | null
          storage_bucket: string | null
          meta: Record<string, unknown> | null
          pinned_at: string
        }
        Insert: {
          id?: string
          pinned_by: string
          source_type: string
          source_id: string
          media_kind: string
          title: string
          caption?: string | null
          youtube_url?: string | null
          file_path?: string | null
          storage_bucket?: string | null
          meta?: Record<string, unknown> | null
          pinned_at?: string
        }
        Update: {
          id?: string
          pinned_by?: string
          source_type?: string
          source_id?: string
          media_kind?: string
          title?: string
          caption?: string | null
          youtube_url?: string | null
          file_path?: string | null
          storage_bucket?: string | null
          meta?: Record<string, unknown> | null
          pinned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      date_posts: {
        Row: {
          id: string
          date_id: string
          author_id: string
          body: string | null
          media_kind: string
          file_path: string | null
          youtube_url: string | null
          created_at: string
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          location_source: string | null
        }
        Insert: {
          id?: string
          date_id: string
          author_id: string
          body?: string | null
          media_kind?: string
          file_path?: string | null
          youtube_url?: string | null
          created_at?: string
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
        }
        Update: {
          id?: string
          date_id?: string
          author_id?: string
          body?: string | null
          media_kind?: string
          file_path?: string | null
          youtube_url?: string | null
          created_at?: string
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "date_posts_date_id_fkey"
            columns: ["date_id"]
            isOneToOne: false
            referencedRelation: "queen_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          topic: string
        }
        Insert: {
          id?: string
          created_at?: string
          topic?: string
        }
        Update: {
          id?: string
          created_at?: string
          topic?: string
        }
        Relationships: []
      }
      conversation_members: {
        Row: {
          conversation_id: string
          user_id: string
          last_read_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          last_read_at?: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string | null
          media_path: string | null
          media_type: string | null
          voice_path: string | null
          voice_duration_ms: number | null
          attachment_type: string | null
          attachment_id: string | null
          attachment_anchor: string | null
          reply_to_id: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content?: string | null
          media_path?: string | null
          media_type?: string | null
          voice_path?: string | null
          voice_duration_ms?: number | null
          attachment_type?: string | null
          attachment_id?: string | null
          attachment_anchor?: string | null
          reply_to_id?: string | null
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string | null
          media_path?: string | null
          media_type?: string | null
          voice_path?: string | null
          voice_duration_ms?: number | null
          attachment_type?: string | null
          attachment_id?: string | null
          attachment_anchor?: string | null
          reply_to_id?: string | null
          deleted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          kind: string
          title: string
          body: string | null
          href: string
          entity_type: string | null
          entity_id: string | null
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          kind: string
          title: string
          body?: string | null
          href?: string
          entity_type?: string | null
          entity_id?: string | null
          created_at?: string
          read_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          kind?: string
          title?: string
          body?: string | null
          href?: string
          entity_type?: string | null
          entity_id?: string | null
          created_at?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_requests: {
        Row: {
          id: string
          requested_by: string
          requested_from: string
          status: string
          message: string | null
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          shared_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requested_by: string
          requested_from: string
          status?: string
          message?: string | null
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          shared_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requested_by?: string
          requested_from?: string
          status?: string
          message?: string | null
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          shared_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_requests_requested_from_fkey"
            columns: ["requested_from"]
            isOneToOne: false
            referencedRelation: "users"
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
          media_kind: string
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
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          location_source: string | null
          reaction_score: number | null
          reacted_at: string | null
          view_count: number
        }
        Insert: {
          id?: string
          sent_by: string
          sent_to: string
          title?: string | null
          message?: string | null
          image_path?: string | null
          media_kind?: string
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
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
          reaction_score?: number | null
          reacted_at?: string | null
          view_count?: number
        }
        Update: {
          id?: string
          sent_by?: string
          sent_to?: string
          title?: string | null
          message?: string | null
          image_path?: string | null
          media_kind?: string
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
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
          reaction_score?: number | null
          reacted_at?: string | null
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
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          location_source: string | null
        }
        Insert: {
          file_path?: string | null
          id?: string
          media_type: string
          submission_id: string
          uploaded_at?: string
          youtube_url?: string | null
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
        }
        Update: {
          file_path?: string | null
          id?: string
          media_type?: string
          submission_id?: string
          uploaded_at?: string
          youtube_url?: string | null
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          location_source?: string | null
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
          punishment_id: string | null
          recurrence_pattern: string | null
          status: string
          title: string
          updated_at: string
          started_at: string | null
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
          punishment_id?: string | null
          recurrence_pattern?: string | null
          status?: string
          title: string
          updated_at?: string
          started_at?: string | null
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
          punishment_id?: string | null
          recurrence_pattern?: string | null
          status?: string
          title?: string
          updated_at?: string
          started_at?: string | null
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
          {
            foreignKeyName: "tasks_punishment_id_fkey"
            columns: ["punishment_id"]
            isOneToOne: false
            referencedRelation: "punishments"
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
      streak_milestones: {
        Row: {
          id: string
          created_by: string
          target_days: number
          title: string
          description: string | null
          reward_suggestion: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          created_by: string
          target_days: number
          title: string
          description?: string | null
          reward_suggestion?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          target_days?: number
          title?: string
          description?: string | null
          reward_suggestion?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streak_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      streak_milestone_awards: {
        Row: {
          id: string
          milestone_id: string
          awarded_at: string
          streak_at_award: number
        }
        Insert: {
          id?: string
          milestone_id: string
          awarded_at?: string
          streak_at_award: number
        }
        Update: {
          id?: string
          milestone_id?: string
          awarded_at?: string
          streak_at_award?: number
        }
        Relationships: [
          {
            foreignKeyName: "streak_milestone_awards_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "streak_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          id: string
          author_id: string
          body: string
          visibility: string
          entry_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          body: string
          visibility?: string
          entry_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          body?: string
          visibility?: string
          entry_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_comments: {
        Row: {
          id: string
          entry_id: string
          author_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          entry_id?: string
          author_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_status: {
        Row: {
          user_id: string
          mood_level: number
          mood_emoji: string
          availability: string | null
          availability_source: string | null
          last_active_at: string | null
          no_contact_ends_at: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          mood_level?: number
          mood_emoji?: string
          availability?: string | null
          availability_source?: string | null
          last_active_at?: string | null
          no_contact_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          mood_level?: number
          mood_emoji?: string
          availability?: string | null
          availability_source?: string | null
          last_active_at?: string | null
          no_contact_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      queen_size_chart: {
        Row: {
          user_id: string
          height: string | null
          bust: string | null
          waist: string | null
          hips: string | null
          dress_size: string | null
          top_size: string | null
          bottom_size: string | null
          bra_size: string | null
          underwear_size: string | null
          shoe_size: string | null
          ring_size: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          height?: string | null
          bust?: string | null
          waist?: string | null
          hips?: string | null
          dress_size?: string | null
          top_size?: string | null
          bottom_size?: string | null
          bra_size?: string | null
          underwear_size?: string | null
          shoe_size?: string | null
          ring_size?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          height?: string | null
          bust?: string | null
          waist?: string | null
          hips?: string | null
          dress_size?: string | null
          top_size?: string | null
          bottom_size?: string | null
          bra_size?: string | null
          underwear_size?: string | null
          shoe_size?: string | null
          ring_size?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queen_size_chart_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      queen_work_schedule: {
        Row: {
          id: string
          user_id: string
          week_start: string
          day_of_week: number
          start_time: string
          end_time: string
          enabled: boolean
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          week_start: string
          day_of_week: number
          start_time: string
          end_time: string
          enabled?: boolean
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          week_start?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          enabled?: boolean
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queen_work_schedule_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_counters: {
        Row: {
          key: string
          reset_at: string
          reset_by: string | null
          count: number
          last_increment_at: string | null
        }
        Insert: {
          key: string
          reset_at?: string
          reset_by?: string | null
          count?: number
          last_increment_at?: string | null
        }
        Update: {
          key?: string
          reset_at?: string
          reset_by?: string | null
          count?: number
          last_increment_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pair_counters_reset_by_fkey"
            columns: ["reset_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_settings: {
        Row: {
          key: string
          value: Record<string, unknown>
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          value?: Record<string, unknown>
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          value?: Record<string, unknown>
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pair_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attention_usage: {
        Row: {
          user_id: string
          usage_date: string
          messages_sent: number
          requests_sent: number
        }
        Insert: {
          user_id: string
          usage_date?: string
          messages_sent?: number
          requests_sent?: number
        }
        Update: {
          user_id?: string
          usage_date?: string
          messages_sent?: number
          requests_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "attention_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          id: string
          user_id: string
          delta: number
          reason: string
          entity_type: string | null
          entity_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          delta: number
          reason: string
          entity_type?: string | null
          entity_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          delta?: number
          reason?: string
          entity_type?: string | null
          entity_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          id: string
          created_by: string
          title: string
          description: string | null
          price: number
          image_path: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          title: string
          description?: string | null
          price: number
          image_path?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          title?: string
          description?: string | null
          price?: number
          image_path?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_purchases: {
        Row: {
          id: string
          item_id: string
          purchased_by: string
          price_paid: number
          status: string
          queen_note: string | null
          ledger_id: string | null
          created_at: string
          fulfilled_at: string | null
        }
        Insert: {
          id?: string
          item_id: string
          purchased_by: string
          price_paid: number
          status?: string
          queen_note?: string | null
          ledger_id?: string | null
          created_at?: string
          fulfilled_at?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          purchased_by?: string
          price_paid?: number
          status?: string
          queen_note?: string | null
          ledger_id?: string | null
          created_at?: string
          fulfilled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_assignments: {
        Row: {
          id: string
          assigned_by: string
          assigned_to: string
          gallery_id: string | null
          topic: string
          description: string | null
          min_entries: number
          due_at: string
          status: string
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assigned_by: string
          assigned_to: string
          gallery_id?: string | null
          topic: string
          description?: string | null
          min_entries?: number
          due_at: string
          status?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          assigned_by?: string
          assigned_to?: string
          gallery_id?: string | null
          topic?: string
          description?: string | null
          min_entries?: number
          due_at?: string
          status?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_assignments_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "worship_galleries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: { Args: never; Returns: string }
      ensure_queen_slave_conversation: { Args: never; Returns: string }
      ensure_topic_conversations: { Args: never; Returns: string }
      get_topic_conversation: { Args: { p_topic: string }; Returns: string }
      list_inbox_threads: {
        Args: never
        Returns: {
          conversation_id: string
          topic: string
          unread: number
          last_message: Record<string, unknown> | null
          other_user: Record<string, unknown> | null
        }[]
      }
      count_inbox_unread: { Args: never; Returns: number }
      send_inbox_message: {
        Args: {
          p_conversation_id: string
          p_content?: string | null
          p_media_path?: string | null
          p_media_type?: string | null
          p_voice_path?: string | null
          p_voice_duration_ms?: number | null
          p_attachment_type?: string | null
          p_attachment_id?: string | null
          p_attachment_anchor?: string | null
          p_reply_to_id?: string | null
        }
        Returns: Database["public"]["Tables"]["direct_messages"]["Row"]
      }
      apply_queen_work_schedules: { Args: never; Returns: number }
      notify_user: {
        Args: {
          p_user_id: string
          p_kind: string
          p_title: string
          p_body?: string | null
          p_href?: string | null
          p_entity_type?: string | null
          p_entity_id?: string | null
        }
        Returns: string
      }
      ensure_recurring_task_occurrences: {
        Args: { look_ahead_days?: number }
        Returns: number
      }
      complete_expired_punishments: { Args: never; Returns: number }
      has_active_contact_restriction: {
        Args: { target_id?: string }
        Returns: boolean
      }
      has_active_punishment: {
        Args: { p_user?: string; p_type?: string | null }
        Returns: boolean
      }
      has_punishment_effect: {
        Args: { p_user?: string; p_effect?: string }
        Returns: boolean
      }
      evaluate_task_debt: {
        Args: { p_punishment_id: string }
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
      get_queen_status: {
        Args: never
        Returns: {
          queen_id: string
          username: string
          availability: string | null
          updated_at: string | null
          last_active_at: string | null
          no_contact_ends_at: string | null
        }[]
      }
      touch_last_active: { Args: never; Returns: undefined }
      is_no_contact_active: { Args: never; Returns: boolean }
      clear_expired_no_contact: { Args: never; Returns: number }
      get_slave_write_lock: { Args: never; Returns: Json }
      increment_queen_love: { Args: never; Returns: Json }
      reset_queen_love: { Args: never; Returns: Json }
      assert_slave_can_mutate: { Args: never; Returns: undefined }
      get_attention_budget: { Args: never; Returns: Record<string, unknown> }
      get_wishlist_budget: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      fetch_wishlist_items: {
        Args: Record<string, never>
        Returns: Json
      }
      mark_wishlist_arrived: {
        Args: { p_item_id: string }
        Returns: Json
      }
      record_wishlist_purchase: {
        Args: {
          p_item_id: string
          p_price_usd: number
          p_status: string
          p_fulfillment_notes?: string | null
        }
        Returns: Json
      }
      set_wishlist_budget: {
        Args: {
          p_user_id: string
          p_weekly_usd_limit?: number | null
          p_weekly_item_limit?: number | null
          p_credit_usd?: number | null
          p_credit_items?: number | null
        }
        Returns: Json
      }
      list_wishlist_purchases: {
        Args: { p_user_id?: string; p_week_only?: boolean }
        Returns: Json
      }
      wishlist_week_start_pt: {
        Args: { p_at?: string }
        Returns: string
      }
      consume_attention: {
        Args: { p_kind: string }
        Returns: Record<string, unknown>
      }
      grant_speak_freely_tokens: { Args: { p_count?: number }; Returns: number }
      points_balance: { Args: { p_user?: string }; Returns: number }
      purchase_shop_item: { Args: { p_item_id: string }; Returns: string }
      create_worship_assignment: {
        Args: {
          p_topic: string
          p_description: string | null
          p_min_entries: number
          p_due_at: string
        }
        Returns: string
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
