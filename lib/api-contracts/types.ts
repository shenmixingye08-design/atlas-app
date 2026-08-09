/**
 * P2-01 API contract types — boolean / enum checks only in Production probes.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type FieldType =
  | "boolean"
  | "string"
  | "number"
  | "object"
  | "array"
  | "nullish";

export type FieldContract = {
  type: FieldType;
  /** When set, value must equal one of these (strict). */
  enum?: ReadonlyArray<JsonPrimitive>;
  optional?: boolean;
};

export type ApiContract = {
  id: string;
  method: "GET" | "POST";
  /** Absolute path beginning with /api/ */
  path: string;
  /** Expected HTTP status (single). */
  status: number;
  /** Required top-level fields and types. */
  fields: Record<string, FieldContract>;
  /**
   * When true, Production probe fetches without secrets.
   * Auth-gated routes used only for unauthorized contract checks stay publicFetch.
   */
  publicFetch: boolean;
  /** Human-readable why this API is "重要". */
  criticalReason: string;
};

export type ContractCheckResult = {
  id: string;
  path: string;
  ok: boolean;
  httpStatus: number | null;
  expectedStatus: number;
  error: string | null;
  fieldFailures: string[];
};

export type ApiContractsProbeResult = {
  ok: boolean;
  contractsDefined: number;
  contractsChecked: number;
  contractsPassed: number;
  allCriticalCovered: boolean;
  qualityGateWired: boolean;
  memoryNotSot: boolean;
  multiInstanceSafe: boolean;
  failClosed: boolean;
  results: ContractCheckResult[];
  error: string | null;
  commitShaShort: string;
  environment: string;
};
