import type {
  ConnectionRecord,
  ConnectionStatus,
  ExecuteInput,
  ExecuteResult,
  IntegrationServiceId,
  TokenRecord,
} from "@/lib/integration-platform/types";

/**
 * Common Integration Adapter — every external service implements this.
 * connect/validate/execute/retry/rollback/health are first-class.
 */
export interface IntegrationAdapter {
  readonly serviceId: IntegrationServiceId;

  connect(ownerId: string, params?: Record<string, unknown>): Promise<ConnectionRecord>;

  disconnect(ownerId: string): Promise<ConnectionRecord>;

  refreshToken(ownerId: string): Promise<TokenRecord | null>;

  validate(ownerId: string): Promise<{
    status: ConnectionStatus;
    message: string | null;
  }>;

  execute(input: ExecuteInput): Promise<ExecuteResult>;

  /** Optional compensating action when a later step fails */
  rollback?(input: {
    ownerId: string;
    externalId: string;
    reason: string;
  }): Promise<{ ok: boolean; message: string }>;

  health(ownerId: string): Promise<{
    ok: boolean;
    status: ConnectionStatus;
    latencyMs: number;
    detail: string | null;
  }>;
}
