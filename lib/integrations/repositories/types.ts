import type {
  ConnectIntegrationInput,
  Integration,
  IntegrationFilter,
  IntegrationProviderId,
  UpdateIntegrationInput,
} from "../types";

export interface IntegrationRepository {
  list(filter?: IntegrationFilter): Promise<Integration[]>;
  findById(id: string): Promise<Integration | null>;
  findByProvider(provider: IntegrationProviderId): Promise<Integration | null>;
  create(input: ConnectIntegrationInput): Promise<Integration>;
  save(integration: Integration): Promise<Integration>;
  update(id: string, patch: UpdateIntegrationInput): Promise<Integration | null>;
  delete(id: string): Promise<boolean>;
}
