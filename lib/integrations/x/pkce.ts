import { createHash, randomBytes } from "crypto";

export function generatePkceCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generatePkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
