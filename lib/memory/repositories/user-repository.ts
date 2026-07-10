import type {
  CreateUserInput,
  PageRequest,
  PageResult,
  UpdateUserInput,
  User,
  UserFilter,
} from "../types";

/**
 * Persistence contract for {@link User}.
 * Supabase: `users` table synced from Clerk via webhook or session upsert.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findMany(filter?: UserFilter, page?: PageRequest): Promise<PageResult<User>>;
  upsert(input: CreateUserInput): Promise<User>;
  update(input: UpdateUserInput): Promise<User>;
  delete(id: string): Promise<void>;
}
