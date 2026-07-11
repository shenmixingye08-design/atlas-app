import { createHash, randomBytes } from "crypto";

export function generateDropboxPkceCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateDropboxPkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
