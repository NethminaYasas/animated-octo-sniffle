export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      boards: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string;
          id: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      invite_codes: {
        Row: {
          code_hash: string;
          code_hint: string;
          created_at: string;
          created_by: string | null;
          created_request_id: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          used_at: string | null;
          used_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          code_hash: string;
          code_hint: string;
          created_at?: string;
          created_by?: string | null;
          created_request_id?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code_hash?: string;
          code_hint?: string;
          created_at?: string;
          created_by?: string | null;
          created_request_id?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invite_codes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invite_codes_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invite_codes_used_by_fkey";
            columns: ["used_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      member_bans: {
        Row: {
          banned_by: string | null;
          created_at: string;
          expires_at: string | null;
          id: number;
          lift_reason: string | null;
          lifted_at: string | null;
          lifted_by: string | null;
          reason: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          banned_by?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: never;
          lift_reason?: string | null;
          lifted_at?: string | null;
          lifted_by?: string | null;
          reason: string;
          user_id: string;
        };
        Update: {
          banned_by?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: never;
          lift_reason?: string | null;
          lifted_at?: string | null;
          lifted_by?: string | null;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_bans_banned_by_fkey";
            columns: ["banned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_bans_lifted_by_fkey";
            columns: ["lifted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_bans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      member_warnings: {
        Row: {
          acknowledged_at: string | null;
          created_at: string;
          id: number;
          moderator_id: string | null;
          reason: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          acknowledged_at?: string | null;
          created_at?: string;
          id?: never;
          moderator_id?: string | null;
          reason: string;
          user_id: string;
        };
        Update: {
          acknowledged_at?: string | null;
          created_at?: string;
          id?: never;
          moderator_id?: string | null;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_warnings_moderator_id_fkey";
            columns: ["moderator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_warnings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mod_log: {
        Row: {
          action: Database["public"]["Enums"]["mod_action"];
          actor_id: string | null;
          actor_username: string;
          created_at: string;
          id: number;
          new_value: NonNullable<Json>;
          previous_value: NonNullable<Json>;
          reason: string;
          target_id: string;
          target_label: string;
          target_type: Database["public"]["Enums"]["mod_target_type"];
        };
        ComputedFields: never;
        Insert: {
          action: Database["public"]["Enums"]["mod_action"];
          actor_id?: string | null;
          actor_username: string;
          created_at?: string;
          id?: never;
          new_value?: NonNullable<Json>;
          previous_value?: NonNullable<Json>;
          reason: string;
          target_id: string;
          target_label?: string;
          target_type: Database["public"]["Enums"]["mod_target_type"];
        };
        Update: {
          action?: Database["public"]["Enums"]["mod_action"];
          actor_id?: string | null;
          actor_username?: string;
          created_at?: string;
          id?: never;
          new_value?: NonNullable<Json>;
          previous_value?: NonNullable<Json>;
          reason?: string;
          target_id?: string;
          target_label?: string;
          target_type?: Database["public"]["Enums"]["mod_target_type"];
        };
        Relationships: [
          {
            foreignKeyName: "mod_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          actor_username: string;
          created_at: string;
          excerpt: string;
          id: number;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id: number;
          read_at: string | null;
          thread_id: number;
          thread_title: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_username: string;
          created_at?: string;
          excerpt?: string;
          id?: never;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id: number;
          read_at?: string | null;
          thread_id: number;
          thread_title: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          actor_username?: string;
          created_at?: string;
          excerpt?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["notification_kind"];
          post_id?: number;
          read_at?: string | null;
          thread_id?: number;
          thread_title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_uploads: {
        Row: {
          created_at: string;
          post_id: number;
          upload_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          post_id: number;
          upload_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: number;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_uploads_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_uploads_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "public_uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_uploads_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          deleted_reason: string | null;
          edited_at: string | null;
          id: number;
          is_deleted: boolean;
          is_opening: boolean;
          reply_to_post_id: number | null;
          thread_id: number;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_reason?: string | null;
          edited_at?: string | null;
          id?: never;
          is_deleted?: boolean;
          is_opening?: boolean;
          reply_to_post_id?: number | null;
          thread_id: number;
        };
        Update: {
          author_id?: string | null;
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_reason?: string | null;
          edited_at?: string | null;
          id?: never;
          is_deleted?: boolean;
          is_opening?: boolean;
          reply_to_post_id?: number | null;
          thread_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_reply_to_post_id_fkey";
            columns: ["reply_to_post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "threads";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          banned_until: string | null;
          created_at: string;
          id: string;
          is_banned: boolean;
          onboarding_completed: boolean;
          reaction_score: number;
          role: Database["public"]["Enums"]["user_role"];
          username: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          banned_until?: string | null;
          created_at?: string;
          id: string;
          is_banned?: boolean;
          onboarding_completed?: boolean;
          reaction_score?: number;
          role?: Database["public"]["Enums"]["user_role"];
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          banned_until?: string | null;
          created_at?: string;
          id?: string;
          is_banned?: boolean;
          onboarding_completed?: boolean;
          reaction_score?: number;
          role?: Database["public"]["Enums"]["user_role"];
          username?: string;
        };
        Relationships: [];
      };
      reactions: {
        Row: {
          created_at: string;
          id: number;
          kind: Database["public"]["Enums"]["reaction_kind"];
          post_id: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          kind: Database["public"]["Enums"]["reaction_kind"];
          post_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["reaction_kind"];
          post_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      report_resolutions: {
        Row: {
          created_at: string;
          mod_log_id: number;
          report_id: number;
          resolution_note: string;
          resolved_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          mod_log_id: number;
          report_id: number;
          resolution_note: string;
          resolved_by?: string | null;
        };
        Update: {
          created_at?: string;
          mod_log_id?: number;
          report_id?: number;
          resolution_note?: string;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_resolutions_mod_log_id_fkey";
            columns: ["mod_log_id"];
            isOneToOne: false;
            referencedRelation: "mod_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_resolutions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: true;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_resolutions_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: number;
          post_id: number | null;
          reason: string;
          reporter_id: string | null;
          status: Database["public"]["Enums"]["report_status"];
          target_type: Database["public"]["Enums"]["report_target_type"];
          target_upload_id: string | null;
          target_user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          post_id?: number | null;
          reason: string;
          reporter_id?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_type?: Database["public"]["Enums"]["report_target_type"];
          target_upload_id?: string | null;
          target_user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          post_id?: number | null;
          reason?: string;
          reporter_id?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_type?: Database["public"]["Enums"]["report_target_type"];
          target_upload_id?: string | null;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_upload_id_fkey";
            columns: ["target_upload_id"];
            isOneToOne: false;
            referencedRelation: "public_uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_upload_id_fkey";
            columns: ["target_upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      security_events: {
        Row: {
          created_at: string;
          event: string;
          id: number;
          ip: unknown;
          metadata: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event: string;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          event?: string;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      threads: {
        Row: {
          author_id: string | null;
          board_id: string;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          deleted_reason: string | null;
          id: number;
          is_deleted: boolean;
          is_locked: boolean;
          is_pinned: boolean;
          last_post_at: string;
          reply_count: number;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          board_id: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_reason?: string | null;
          id?: never;
          is_deleted?: boolean;
          is_locked?: boolean;
          is_pinned?: boolean;
          last_post_at?: string;
          reply_count?: number;
          title: string;
        };
        Update: {
          author_id?: string | null;
          board_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_reason?: string | null;
          id?: never;
          is_deleted?: boolean;
          is_locked?: boolean;
          is_pinned?: boolean;
          last_post_at?: string;
          reply_count?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "threads_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "threads_board_id_fkey";
            columns: ["board_id"];
            isOneToOne: false;
            referencedRelation: "boards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "threads_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      upload_hash_blocks: {
        Row: {
          blocked_by: string | null;
          created_at: string;
          reason: string;
          sha256: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_by?: string | null;
          created_at?: string;
          reason: string;
          sha256: string;
        };
        Update: {
          blocked_by?: string | null;
          created_at?: string;
          reason?: string;
          sha256?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upload_hash_blocks_blocked_by_fkey";
            columns: ["blocked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      uploads: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string;
          provider: string;
          provider_file_id: string | null;
          raw_sha256: string;
          removal_reason: string | null;
          removed_at: string | null;
          removed_by: string | null;
          sha256: string;
          size_bytes: number;
          status: string;
          uploader_id: string;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          mime_type: string;
          provider?: string;
          provider_file_id?: string | null;
          raw_sha256: string;
          removal_reason?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          sha256: string;
          size_bytes: number;
          status?: string;
          uploader_id: string;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mime_type?: string;
          provider?: string;
          provider_file_id?: string | null;
          raw_sha256?: string;
          removal_reason?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          sha256?: string;
          size_bytes?: number;
          status?: string;
          uploader_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "uploads_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "uploads_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      public_uploads: {
        Row: {
          id: string;
          mime_type: string;
          size_bytes: number;
          status: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          status?: string | null;
          url?: never;
        };
        Update: {
          id?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          status?: string | null;
          url?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      acknowledge_warning: { Args: { p_warning_id: number }; Returns: boolean };
      admin_create_invite_codes: {
        Args: { p_count: number; p_reason: string; p_request_id?: string };
        Returns: {
          batch_id: string;
          code: string;
          code_hash: string;
          code_hint: string;
        }[];
      };
      admin_list_invite_codes: {
        Args: { p_limit?: number };
        Returns: {
          code_hash: string;
          code_hint: string;
          created_at: string;
          created_by_username: string;
          revoked_at: string;
          revoked_by_username: string;
          status: string;
          used_at: string;
          used_by_username: string;
        }[];
      };
      admin_revoke_invite_code: {
        Args: { p_code_hash: string; p_reason: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      admin_set_role: {
        Args: {
          p_reason: string;
          p_role: Database["public"]["Enums"]["user_role"];
          p_target_id: string;
        };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      consume_invite_code: { Args: { p_code: string }; Returns: boolean };
      consume_upload_quota: { Args: { p_bytes: number; p_user_id: string }; Returns: undefined };
      create_thread: {
        Args: { p_board_id: string; p_content: string; p_title: string };
        Returns: {
          post_id: number;
          thread_id: number;
        }[];
      };
      expire_unlinked_uploads: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          provider_file_id: string;
        }[];
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_banned: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_moderator: { Args: Record<PropertyKey, never>; Returns: boolean };
      link_uploads_to_post: {
        Args: { p_post_id: number; p_upload_ids: string[] };
        Returns: {
          linked: number;
        }[];
      };
      list_thread_comments: {
        Args: { p_after_at?: string; p_after_id?: number; p_limit?: number; p_thread_id: number };
        Returns: {
          author_id: string;
          author_username: string;
          content: string;
          created_at: string;
          deleted_by_username: string;
          deleted_reason: string;
          id: number;
          is_deleted: boolean;
          reply_to_author_username: string;
          reply_to_post_id: number;
        }[];
      };
      list_threads: {
        Args: {
          p_before_at?: string;
          p_before_id?: number;
          p_board_id?: string;
          p_limit?: number;
          p_pinned?: boolean;
          p_sort?: string;
        };
        Returns: {
          author_id: string;
          author_username: string;
          board_id: string;
          board_name: string;
          created_at: string;
          id: number;
          is_locked: boolean;
          is_pinned: boolean;
          last_post_at: string;
          reply_count: number;
          title: string;
        }[];
      };
      moderate_ban_user: {
        Args: { p_reason: string; p_target_id: string; p_until?: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_block_upload_hash: {
        Args: { p_reason: string; p_sha256: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_move_thread: {
        Args: { p_board_id: string; p_reason: string; p_thread_id: number };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_remove_upload: {
        Args: { p_reason: string; p_upload_id: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
          provider: string;
          provider_file_id: string;
        }[];
      };
      moderate_restore_upload: {
        Args: { p_reason: string; p_upload_id: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_set_post_deleted: {
        Args: { p_deleted: boolean; p_post_id: number; p_reason: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_set_thread_deleted: {
        Args: { p_deleted: boolean; p_reason: string; p_thread_id: number };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_set_thread_locked: {
        Args: { p_locked: boolean; p_reason: string; p_thread_id: number };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_set_thread_pinned: {
        Args: { p_pinned: boolean; p_reason: string; p_thread_id: number };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_unban_user: {
        Args: { p_reason: string; p_target_id: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_unblock_upload_hash: {
        Args: { p_reason: string; p_sha256: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      moderate_warn_user: {
        Args: { p_reason: string; p_target_id: string };
        Returns: {
          changed: boolean;
          mod_log_id: number;
          warning_id: number;
        }[];
      };
      my_bans: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          expires_at: string;
          id: number;
          lift_reason: string;
          lifted_at: string;
          reason: string;
          user_id: string;
        }[];
      };
      my_warnings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          acknowledged_at: string;
          created_at: string;
          id: number;
          reason: string;
          user_id: string;
        }[];
      };
      post_reaction_summary: {
        Args: { p_post_ids: number[] };
        Returns: {
          kind: Database["public"]["Enums"]["reaction_kind"];
          mine: boolean;
          post_id: number;
          total: number;
        }[];
      };
      promote_member_roles: { Args: Record<PropertyKey, never>; Returns: number };
      recompute_reaction_score: { Args: { target_profile: string }; Returns: undefined };
      resolve_login_email: { Args: { lookup_username: string }; Returns: string };
      staff_resolve_report: {
        Args: {
          p_note: string;
          p_report_id: number;
          p_status: Database["public"]["Enums"]["report_status"];
        };
        Returns: {
          changed: boolean;
          mod_log_id: number;
        }[];
      };
      staff_uploads: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          id: string;
          mime_type: string;
          provider: string;
          provider_file_id: string;
          raw_sha256: string;
          removal_reason: string;
          removed_at: string;
          removed_by: string;
          removed_by_username: string;
          sha256: string;
          size_bytes: number;
          status: string;
          uploader_id: string;
          uploader_username: string;
          url: string;
        }[];
      };
      thread_reaction_summary: {
        Args: { p_thread_id: number };
        Returns: {
          kind: Database["public"]["Enums"]["reaction_kind"];
          mine: boolean;
          post_id: number;
          total: number;
        }[];
      };
    };
    Enums: {
      media_kind: "image" | "video" | "audio";
      media_status: "active" | "removed";
      mod_action:
        | "post.delete"
        | "post.restore"
        | "thread.delete"
        | "thread.restore"
        | "thread.lock"
        | "thread.unlock"
        | "thread.pin"
        | "thread.unpin"
        | "thread.move"
        | "user.ban"
        | "user.unban"
        | "user.warn"
        | "role.change"
        | "report.resolve"
        | "report.dismiss"
        | "invite.create"
        | "invite.revoke"
        | "upload.remove"
        | "upload.restore"
        | "upload.block_hash"
        | "upload.unblock_hash";
      mod_target_type: "post" | "thread" | "user" | "report" | "invite" | "upload" | "upload_hash";
      notification_kind: "reply" | "quote" | "mention";
      reaction_kind: "like" | "laugh" | "wow" | "anger" | "dislike";
      report_status: "open" | "resolved" | "dismissed";
      report_target_type: "post" | "user" | "upload";
      user_role: "new_member" | "member" | "senior_member" | "moderator" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      media_kind: ["image", "video", "audio"],
      media_status: ["active", "removed"],
      mod_action: [
        "post.delete",
        "post.restore",
        "thread.delete",
        "thread.restore",
        "thread.lock",
        "thread.unlock",
        "thread.pin",
        "thread.unpin",
        "thread.move",
        "user.ban",
        "user.unban",
        "user.warn",
        "role.change",
        "report.resolve",
        "report.dismiss",
        "invite.create",
        "invite.revoke",
        "upload.remove",
        "upload.restore",
        "upload.block_hash",
        "upload.unblock_hash",
      ],
      mod_target_type: ["post", "thread", "user", "report", "invite", "upload", "upload_hash"],
      notification_kind: ["reply", "quote", "mention"],
      reaction_kind: ["like", "laugh", "wow", "anger", "dislike"],
      report_status: ["open", "resolved", "dismissed"],
      report_target_type: ["post", "user", "upload"],
      user_role: ["new_member", "member", "senior_member", "moderator", "admin"],
    },
  },
} as const;
