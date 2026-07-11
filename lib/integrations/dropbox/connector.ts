import type { ExternalServiceConnectorModule } from "../connector-types";

/** Connect/disconnect for Dropbox is handled by ExternalServiceManager + OAuth routes. */
export const dropboxConnector: ExternalServiceConnectorModule = {
  connect: async () => {
    throw new Error(
      "Dropbox OAuth must be started via ExternalServiceManager.connect",
    );
  },
  disconnect: async () => {
    throw new Error(
      "Dropbox disconnect is handled by the external service manager.",
    );
  },
};
