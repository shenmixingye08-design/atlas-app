/** True on Vercel Production or NODE_ENV=production. */
export function isAtlasProduction(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}
