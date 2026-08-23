/** Narrow escape hatch until generated Database types include billing usage RPCs. */

export type UntypedSupabase = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => UntypedFrom;
};

type UntypedFilter = {
  eq: (col: string, val: string) => UntypedFilter;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: unknown;
  }>;
  then: (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

type UntypedFrom = {
  select: (cols: string) => UntypedFilter;
};

export function asUntypedSupabase(client: object): UntypedSupabase {
  return client as unknown as UntypedSupabase;
}
