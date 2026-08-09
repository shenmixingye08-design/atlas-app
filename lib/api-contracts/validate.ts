import type {
  ApiContract,
  ContractCheckResult,
  FieldContract,
  JsonObject,
  JsonValue,
} from "./types";

function typeOfValue(value: JsonValue): FieldContract["type"] {
  if (value === null) return "nullish";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "boolean") return "boolean";
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "object") return "object";
  return "nullish";
}

export function validateFields(
  body: unknown,
  fields: ApiContract["fields"],
): string[] {
  const failures: string[] = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["body_not_object"];
  }
  const obj = body as JsonObject;
  for (const [key, contract] of Object.entries(fields)) {
    if (!(key in obj)) {
      if (!contract.optional) failures.push(`missing:${key}`);
      continue;
    }
    const value = obj[key] as JsonValue;
    if (value === undefined || value === null) {
      if (contract.type === "nullish" || contract.optional) continue;
      failures.push(`null:${key}`);
      continue;
    }
    const actual = typeOfValue(value);
    if (actual !== contract.type) {
      failures.push(`type:${key}:expected_${contract.type}:got_${actual}`);
      continue;
    }
    if (contract.enum && !contract.enum.includes(value as never)) {
      failures.push(`enum:${key}`);
    }
  }
  return failures;
}

export function evaluateContractResponse(input: {
  contract: ApiContract;
  httpStatus: number;
  body: unknown;
}): ContractCheckResult {
  const fieldFailures =
    input.httpStatus === input.contract.status
      ? validateFields(input.body, input.contract.fields)
      : [`http_status:expected_${input.contract.status}:got_${input.httpStatus}`];

  const ok = fieldFailures.length === 0;
  return {
    id: input.contract.id,
    path: input.contract.path,
    ok,
    httpStatus: input.httpStatus,
    expectedStatus: input.contract.status,
    error: ok ? null : fieldFailures[0] ?? "contract_failed",
    fieldFailures,
  };
}

/** Pure duplicate-execution helper: same inputs → same ok. */
export function contractsEqualResult(
  a: ContractCheckResult,
  b: ContractCheckResult,
): boolean {
  return (
    a.id === b.id &&
    a.ok === b.ok &&
    a.httpStatus === b.httpStatus &&
    a.error === b.error &&
    a.fieldFailures.join("|") === b.fieldFailures.join("|")
  );
}
