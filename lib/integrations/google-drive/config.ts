/** Google OAuth and Drive API configuration (server-only). */
export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
  "profile",
] as const;

export const GOOGLE_OAUTH_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export const GOOGLE_DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files";

export const ATLAS_ROOT_FOLDER = "ATLAS";
export const ATLAS_PROJECTS_FOLDER = "Projects";

export function getGoogleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!value) {
    throw new Error(
      "GOOGLE_CLIENT_ID is not configured. Add it to .env.local to connect Google Drive.",
    );
  }
  return value;
}

export function getGoogleClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error(
      "GOOGLE_CLIENT_SECRET is not configured. Add it to .env.local to connect Google Drive.",
    );
  }
  return value;
}

export function getGoogleRedirectUri(requestOrigin: string): string {
  const configured = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${requestOrigin}/api/integrations/oauth/google-drive/callback`;
}

export function buildDriveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function sanitizeDriveFolderName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return cleaned.slice(0, 100) || "Untitled Project";
}
