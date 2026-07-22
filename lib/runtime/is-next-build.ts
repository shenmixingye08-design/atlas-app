/** True during `next build` prerender / static generation — not a live request. */
export function isNextBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}
