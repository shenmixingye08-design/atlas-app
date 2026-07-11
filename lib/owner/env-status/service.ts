import "server-only";

import { buildOwnerEnvStatusSnapshot } from "./engine";
import type { OwnerEnvStatusSnapshot } from "./types";

export function getOwnerEnvStatusSnapshot(): OwnerEnvStatusSnapshot {
  return buildOwnerEnvStatusSnapshot();
}
