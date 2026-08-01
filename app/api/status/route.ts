import { getSystemStatusSnapshot } from "@/lib/owner/system-status/service";
import {
  getPublicStatusComponents,
  incidentPhaseLabel,
  listPublicIncidents,
} from "@/lib/release-gate/status-components";

export async function GET(): Promise<Response> {
  const snapshot = getSystemStatusSnapshot();
  const components = getPublicStatusComponents();
  const incidents = listPublicIncidents(10).map((incident) => ({
    ...incident,
    phaseLabel: incidentPhaseLabel(incident.phase),
  }));

  return Response.json(
    {
      ...snapshot,
      components,
      incidents,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
