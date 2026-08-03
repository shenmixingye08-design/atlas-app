import { createHash, randomBytes } from "crypto";

export function generateGooglePkceCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateGooglePkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
