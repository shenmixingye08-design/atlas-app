import type { XPostBatchServiceResult } from "./batch-service";

export function mapXPostBatchResult(result: XPostBatchServiceResult): Response {
  if (result.status === "unauthorized") {
    return Response.json(result, { status: 401 });
  }
  if (result.status === "not_found") {
    return Response.json(result, { status: 404 });
  }
  if (result.status === "feature_disabled" || result.status === "plan_limited") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "validation_failed") {
    return Response.json(result, { status: 422 });
  }
  if (result.status === "rate_limited") {
    return Response.json(result, { status: 429 });
  }
  if (result.status === "conflict") {
    return Response.json(result, { status: 409 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 500 });
  }
  return Response.json(result);
}
