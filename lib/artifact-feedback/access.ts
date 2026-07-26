export function assertCanMutateFeedback(input: {
  viewerUserId: string
  targetUserId: string
}): void {
  if (input.viewerUserId !== input.targetUserId) {
    throw new Error("forbidden")
  }
}

export function canReadArtifactFeedback(input: {
  viewerUserId: string
  feedbackUserId: string
  isOwner: boolean
}): boolean {
  if (input.isOwner) return true
  return input.viewerUserId === input.feedbackUserId
}
