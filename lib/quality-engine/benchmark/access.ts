/** API-layer helpers (DB RLS is deny-all; service role + these checks). */

export function assertOwnerCanRunBenchmark(isOwner: boolean): void {
  if (!isOwner) {
    throw new Error("forbidden: owner only");
  }
}

export function canReadUserFeedback(input: {
  viewerUserId: string;
  feedbackUserId: string;
  isOwner: boolean;
}): boolean {
  if (input.isOwner) return true;
  return input.viewerUserId === input.feedbackUserId;
}
