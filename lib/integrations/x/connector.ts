import type { ExternalServiceConnectorModule } from "../connector-types";

/** Connect/disconnect for X is handled by ExternalServiceManager + OAuth routes. */
export const xConnector: ExternalServiceConnectorModule = {
  connect: async () => {
    throw new Error("X connect requires OAuth redirect. Use the authorize endpoint.");
  },
  disconnect: async () => {
    throw new Error("X disconnect is handled by the external service manager.");
  },
};
