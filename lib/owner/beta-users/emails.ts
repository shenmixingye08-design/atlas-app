/** Parse ATLAS_BETA_USER_EMAILS env (comma-separated, case-insensitive). */
export function parseAtlasBetaUserEmailsFromEnv(): readonly string[] {
  const raw = process.env.ATLAS_BETA_USER_EMAILS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

type RuntimeBetaStore = {
  added: Set<string>;
  removed: Set<string>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getRuntimeStore(): RuntimeBetaStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBetaUserRuntimeStore?: RuntimeBetaStore;
  };

  if (!globalScope.__atlasBetaUserRuntimeStore) {
    globalScope.__atlasBetaUserRuntimeStore = {
      added: new Set(),
      removed: new Set(),
    };
  }

  return globalScope.__atlasBetaUserRuntimeStore;
}

export function listEffectiveBetaUserEmails(): readonly string[] {
  const envEmails = parseAtlasBetaUserEmailsFromEnv();
  const runtime = getRuntimeStore();
  const merged = new Set<string>();

  for (const email of envEmails) {
    if (!runtime.removed.has(email)) {
      merged.add(email);
    }
  }

  for (const email of runtime.added) {
    merged.add(email);
  }

  return [...merged].sort();
}

export function listBetaUserEntries(): Array<{
  email: string;
  source: "env" | "runtime";
}> {
  const envSet = new Set(parseAtlasBetaUserEmailsFromEnv());
  const runtime = getRuntimeStore();

  return listEffectiveBetaUserEmails().map((email) => ({
    email,
    source:
      runtime.added.has(email) && !envSet.has(email) ? "runtime" : "env",
  }));
}

export function addRuntimeBetaUserEmail(email: string): void {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Invalid email");
  }

  const runtime = getRuntimeStore();
  runtime.removed.delete(normalized);
  runtime.added.add(normalized);
}

export function removeBetaUserEmail(email: string): void {
  const normalized = normalizeEmail(email);
  const runtime = getRuntimeStore();
  const envSet = new Set(parseAtlasBetaUserEmailsFromEnv());

  if (runtime.added.has(normalized)) {
    runtime.added.delete(normalized);
    return;
  }

  if (envSet.has(normalized)) {
    runtime.removed.add(normalized);
  }
}

export function resetBetaUserStore(): void {
  const runtime = getRuntimeStore();
  runtime.added.clear();
  runtime.removed.clear();
}

export function isEffectiveBetaUserEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return listEffectiveBetaUserEmails().includes(normalizeEmail(email));
}
