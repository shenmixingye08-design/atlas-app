import {
  buildFeatureAvailabilityMap,
} from "@/lib/feature-flags/access";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";

export async function GET(): Promise<Response> {
  const context = await resolveFeatureAccessContext();
  const flags = buildFeatureAvailabilityMap(context);
  return Response.json({ flags });
}
