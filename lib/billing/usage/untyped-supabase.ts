/** Narrow escape hatch until generated Database types include billing usage RPCs. */

export type UntypedSupabase = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: unknown;
          }>;
        };
      };
    };
  };
};

export function asUntypedSupabase(client: object): UntypedSupabase {
  return client as unknown as UntypedSupabase;
}
