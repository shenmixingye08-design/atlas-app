import type { EntityId, Timestamp, UserId } from "./common";

/**
 * Authenticated ATLAS account.
 * `id` aligns with Clerk `userId` when Supabase is connected.
 */
export interface User {
  id: UserId;
  /** Primary email from the auth provider. */
  email: string;
  /** Display name shown in the UI header and project attribution. */
  displayName: string | null;
  /** Profile image URL from the auth provider. */
  avatarUrl: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CreateUserInput = {
  id: UserId;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type UpdateUserInput = Partial<
  Pick<User, "email" | "displayName" | "avatarUrl">
> & {
  id: UserId;
};

export type UserFilter = {
  ids?: EntityId[];
  email?: string;
};
