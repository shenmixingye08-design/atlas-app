export class DurableSotUnavailableError extends Error {
  readonly code = "DURABLE_SOT_UNAVAILABLE" as const;
  readonly failClosed = true as const;

  constructor(message: string) {
    super(message);
    this.name = "DurableSotUnavailableError";
  }
}

export class LegacyStoreAccessBlockedError extends Error {
  readonly code = "LEGACY_STORE_ACCESS_BLOCKED" as const;

  constructor(message: string) {
    super(message);
    this.name = "LegacyStoreAccessBlockedError";
  }
}
