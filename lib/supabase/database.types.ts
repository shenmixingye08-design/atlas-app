/**
 * Placeholder Supabase Database type.
 * Replace with generated types after running:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 */
export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          work_request: string;
          status: string;
          progress: number;
          assigned_employees: unknown;
          result: unknown | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id?: string | null;
          title: string;
          work_request: string;
          status: string;
          progress: number;
          assigned_employees?: unknown;
          result?: unknown | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          title?: string;
          work_request?: string;
          status?: string;
          progress?: number;
          assigned_employees?: unknown;
          result?: unknown | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      atlas_user_state: {
        Row: {
          user_id: string;
          domain: string;
          payload: unknown;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          domain: string;
          payload: unknown;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          domain?: string;
          payload?: unknown;
          updated_at?: string;
        };
        Relationships: [];
      };
      atlas_billing_subscriptions: {
        Row: {
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          plan_id: string;
          status: string;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          updated_at: string;
          automations_suspended: boolean | null;
          payment_failure_grace_ends_at: string | null;
          plan_profile_synced_at: string | null;
        };
        Insert: {
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          plan_id: string;
          status: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          updated_at?: string;
          automations_suspended?: boolean | null;
          payment_failure_grace_ends_at?: string | null;
          plan_profile_synced_at?: string | null;
        };
        Update: {
          user_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          plan_id?: string;
          status?: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          updated_at?: string;
          automations_suspended?: boolean | null;
          payment_failure_grace_ends_at?: string | null;
          plan_profile_synced_at?: string | null;
        };
        Relationships: [];
      };
      atlas_stripe_webhook_events: {
        Row: {
          event_id: string;
          event_type: string | null;
          processed_at: string;
        };
        Insert: {
          event_id: string;
          event_type?: string | null;
          processed_at?: string;
        };
        Update: {
          event_id?: string;
          event_type?: string | null;
          processed_at?: string;
        };
        Relationships: [];
      };
      atlas_google_oauth_credentials: {
        Row: {
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          scope: string;
          connection_status: string;
          connected_at: string | null;
          last_used_at: string | null;
          account_email: string | null;
          account_name: string | null;
          account_picture_url: string | null;
          error_message: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          scope?: string;
          connection_status?: string;
          connected_at?: string | null;
          last_used_at?: string | null;
          account_email?: string | null;
          account_name?: string | null;
          account_picture_url?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          access_token?: string;
          refresh_token?: string;
          expires_at?: string;
          scope?: string;
          connection_status?: string;
          connected_at?: string | null;
          last_used_at?: string | null;
          account_email?: string | null;
          account_name?: string | null;
          account_picture_url?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      atlas_x_oauth_credentials: {
        Row: {
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          scope: string;
          connection_status: string;
          connected_at: string | null;
          last_used_at: string | null;
          account_email: string | null;
          account_name: string | null;
          account_picture_url: string | null;
          account_username: string | null;
          provider_user_id: string | null;
          error_message: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          scope?: string;
          connection_status?: string;
          connected_at?: string | null;
          last_used_at?: string | null;
          account_email?: string | null;
          account_name?: string | null;
          account_picture_url?: string | null;
          account_username?: string | null;
          provider_user_id?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          access_token?: string;
          refresh_token?: string;
          expires_at?: string;
          scope?: string;
          connection_status?: string;
          connected_at?: string | null;
          last_used_at?: string | null;
          account_email?: string | null;
          account_name?: string | null;
          account_picture_url?: string | null;
          account_username?: string | null;
          provider_user_id?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      atlas_x_autopost_settings: {
        Row: {
          user_id: string;
          enabled: boolean;
          mode: string;
          purpose: string;
          themes: unknown;
          audience: string;
          tone: string;
          frequency: string;
          days_of_week: unknown;
          post_times: unknown;
          timezone: string;
          include_hashtags: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          enabled?: boolean;
          mode?: string;
          purpose?: string;
          themes?: unknown;
          audience?: string;
          tone?: string;
          frequency?: string;
          days_of_week?: unknown;
          post_times?: unknown;
          timezone?: string;
          include_hashtags?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          enabled?: boolean;
          mode?: string;
          purpose?: string;
          themes?: unknown;
          audience?: string;
          tone?: string;
          frequency?: string;
          days_of_week?: unknown;
          post_times?: unknown;
          timezone?: string;
          include_hashtags?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      atlas_x_autopost_runs: {
        Row: {
          id: string;
          user_id: string;
          slot_key: string;
          scheduled_for: string | null;
          status: string;
          mode: string;
          post_type: string | null;
          text: string | null;
          tweet_id: string | null;
          tweet_url: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slot_key: string;
          scheduled_for?: string | null;
          status?: string;
          mode?: string;
          post_type?: string | null;
          text?: string | null;
          tweet_id?: string | null;
          tweet_url?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          slot_key?: string;
          scheduled_for?: string | null;
          status?: string;
          mode?: string;
          post_type?: string | null;
          text?: string | null;
          tweet_id?: string | null;
          tweet_url?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
