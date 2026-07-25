import "server-only";

/** VAPID public key exposed to clients (safe). */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

export function getVapidSubject(): string {
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!subject) {
    throw new Error("VAPID_SUBJECT is not configured");
  }
  return subject.startsWith("mailto:") || subject.startsWith("https://")
    ? subject
    : `mailto:${subject}`;
}

export function getVapidPrivateKey(): string {
  const key = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error("VAPID_PRIVATE_KEY is not configured");
  }
  return key;
}
