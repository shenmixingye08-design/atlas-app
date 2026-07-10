import type { ExternalServiceConnectorModule } from "../connector-types";

/** Connect/disconnect for Google is handled by ExternalServiceManager + OAuth routes. */
export const googleConnector: ExternalServiceConnectorModule = {
  connect: async () => {
    throw new Error(
      "Google connect requires OAuth redirect. Use the authorize endpoint.",
    );
  },
  disconnect: async () => {
    throw new Error(
      "Google disconnect is handled by the external service manager.",
    );
  },
};
