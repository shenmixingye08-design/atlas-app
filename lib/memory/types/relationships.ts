/**
 * ATLAS memory domain — entity relationship summary.
 *
 * ```
 * User 1──* Project
 * User 0..1──* Conversation
 *
 * Project 1──* Conversation
 * Project 1──* WorkflowRun
 * Project 1──* Artifact
 *
 * Conversation 1──* Message
 *
 * WorkflowRun 1──* EmployeeAction
 * WorkflowRun 0..1──* Artifact
 *
 * Artifact 1──* Version
 *
 * Message ──(optional)──> WorkflowRun
 * Message ──(optional)──> Artifact
 * Version ──(optional)──> EmployeeAction
 * Project.latestWorkflowRunId ──> WorkflowRun
 * Artifact.currentVersionId ──> Version
 * Conversation.lastMessageId ──> Message
 * ```
 *
 * Memory write path (future):
 * 1. Resolve or create User (Clerk webhook / session)
 * 2. Create or update Project
 * 3. Open Conversation + append user Message (work request)
 * 4. Start WorkflowRun; stream EmployeeActions per pipeline step
 * 5. Materialize Artifacts + Version rows from deliverables
 * 6. Append assistant/employee Messages; link artifact + run ids
 * 7. Update Project status, progress, latestWorkflowRunId
 */

export const MEMORY_DOMAIN_VERSION = 1 as const;
