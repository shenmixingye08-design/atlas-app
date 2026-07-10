import { listPublicPlans } from "@/lib/billing/service";

export async function GET(): Promise<Response> {
  const plans = listPublicPlans();
  return Response.json({ plans });
}

// Plans are public; auth not required for catalog display.
