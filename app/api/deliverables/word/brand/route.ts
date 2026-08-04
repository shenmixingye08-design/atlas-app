import { auth } from "@clerk/nextjs/server";

import {
  getWordCompanyBrand,
  saveWordCompanyBrand,
  type WordCompanyBrand,
} from "@/lib/deliverables/company-brand";
import { isWordTemplateId } from "@/lib/deliverables/word-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrandPatch = Partial<Omit<WordCompanyBrand, "userId" | "updatedAt">>;

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field}_must_be_string`);
  }
  return value.trim() || undefined;
}

function parseBrandPatch(body: unknown): BrandPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("body_must_be_object");
  }
  const record = body as Record<string, unknown>;
  const defaultTemplateId = optionalString(
    record.defaultTemplateId,
    "defaultTemplateId",
  );
  if (defaultTemplateId && !isWordTemplateId(defaultTemplateId)) {
    throw new Error("defaultTemplateId_invalid");
  }

  return {
    companyName: optionalString(record.companyName, "companyName"),
    departmentName: optionalString(record.departmentName, "departmentName"),
    contactName: optionalString(record.contactName, "contactName"),
    postalCode: optionalString(record.postalCode, "postalCode"),
    address: optionalString(record.address, "address"),
    phone: optionalString(record.phone, "phone"),
    email: optionalString(record.email, "email"),
    website: optionalString(record.website, "website"),
    logoDataUrl:
      record.logoDataUrl === null
        ? ""
        : optionalString(record.logoDataUrl, "logoDataUrl"),
    brandColorHex: optionalString(record.brandColorHex, "brandColorHex"),
    footerText: optionalString(record.footerText, "footerText"),
    defaultFont: optionalString(record.defaultFont, "defaultFont"),
    defaultTemplateId,
  };
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brand = await getWordCompanyBrand(userId);
  return Response.json({ brand });
}

export async function PUT(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const brand = await saveWordCompanyBrand(userId, parseBrandPatch(body));
    return Response.json({ brand });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_brand";
    return Response.json({ error: message }, { status: 400 });
  }
}
