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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
