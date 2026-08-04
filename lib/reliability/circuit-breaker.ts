import "server-only";

export type CircuitName =
  | "openai"
  | "wordpress"
  | "dropbox"
  | "x"
  | "line"
  | "google";

export type CircuitState = "closed" | "open" | "half_open";

type BreakerBucket = {
  failures: number;
  successes: number;
  openedAt: number | null;
  state: CircuitState;
};

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;
const HALF_OPEN_SUCCESS_TO_CLOSE = 2;

function getBreakers(): Map<CircuitName, BreakerBucket> {
  const g = globalThis as typeof globalThis & {
    __atlasCircuitBreakers?: Map<CircuitName, BreakerBucket>;
  };
  if (!g.__atlasCircuitBreakers) {
    g.__atlasCircuitBreakers = new Map();
  }
  return g.__atlasCircuitBreakers;
}

function bucket(name: CircuitName): BreakerBucket {
  const map = getBreakers();
  let b = map.get(name);
  if (!b) {
    b = { failures: 0, successes: 0, openedAt: null, state: "closed" };
    map.set(name, b);
  }
  return b;
}

export function getCircuitState(name: CircuitName): CircuitState {
  const b = bucket(name);
  if (b.state === "open" && b.openedAt != null) {
    if (Date.now() - b.openedAt >= COOLDOWN_MS) {
      b.state = "half_open";
      b.successes = 0;
    }
  }
  return b.state;
}

export function assertCircuitClosed(name: CircuitName): void {
  const state = getCircuitState(name);
  if (state === "open") {
    const err = new Error(`circuit_open:${name}`);
    (err as Error & { code?: string }).code = "CIRCUIT_OPEN";
    throw err;
  }
}

export function recordCircuitSuccess(name: CircuitName): void {
  const b = bucket(name);
  if (b.state === "half_open") {
    b.successes += 1;
    if (b.successes >= HALF_OPEN_SUCCESS_TO_CLOSE) {
      b.state = "closed";
      b.failures = 0;
      b.openedAt = null;
      b.successes = 0;
    }
    return;
  }
  b.failures = 0;
  b.state = "closed";
  b.openedAt = null;
}

export function recordCircuitFailure(name: CircuitName): void {
  const b = bucket(name);
  b.failures += 1;
  b.successes = 0;
  if (b.state === "half_open" || b.failures >= FAILURE_THRESHOLD) {
    b.state = "open";
    b.openedAt = Date.now();
  }
}

export async function withCircuitBreaker<T>(
  name: CircuitName,
  operation: () => Promise<T>,
): Promise<T> {
  assertCircuitClosed(name);
  try {
    const result = await operation();
    recordCircuitSuccess(name);
    return result;
  } catch (error) {
    recordCircuitFailure(name);
    throw error;
  }
}

export function getCircuitBreakerSnapshot(): Record<
  CircuitName,
  { state: CircuitState; failures: number }
> {
  const names: CircuitName[] = [
    "openai",
    "wordpress",
    "dropbox",
    "x",
    "line",
    "google",
  ];
  const out = {} as Record<
    CircuitName,
    { state: CircuitState; failures: number }
  >;
  for (const name of names) {
    const b = bucket(name);
    out[name] = { state: getCircuitState(name), failures: b.failures };
  }
  return out;
}

export function resetCircuitBreakersForTests(): void {
  getBreakers().clear();
}
