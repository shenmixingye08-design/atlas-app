import "server-only";

/**
 * Per-user / org letterhead settings for Word generation.
 * Never invent fictional company data when unset.
 */

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export type WordCompanyBrand = {
  userId: string;
  companyName?: string;
  departmentName?: string;
  contactName?: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  /** Data URL or storage path — never arbitrary remote fetch at render time. */
  logoDataUrl?: string;
  brandColorHex?: string;
  footerText?: string;
  defaultFont?: string;
  defaultTemplateId?: string;
  updatedAt: string;
};

type BrandBucket = Map<string, WordCompanyBrand>;

const LOGO_MAX_BYTES = 500 * 1024;
const LOGO_ALLOWED_PREFIXES = [
  "data:image/png;base64,",
  "data:image/jpeg;base64,",
  "data:image/jpg;base64,",
  "data:image/webp;base64,",
] as const;

function getBrandBucket(): BrandBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasWordCompanyBrand?: BrandBucket;
  };
  if (!scope.__atlasWordCompanyBrand) {
    scope.__atlasWordCompanyBrand = new Map();
  }
  return scope.__atlasWordCompanyBrand;
}

export function resetWordCompanyBrandForTests(): void {
  getBrandBucket().clear();
}

export function validateWordLogoDataUrl(
  value: string | undefined,
): { ok: true; dataUrl: string } | { ok: false; reason: string } {
  if (!value?.trim()) return { ok: false, reason: "empty" };
  const trimmed = value.trim();
  const prefix = LOGO_ALLOWED_PREFIXES.find((item) =>
    trimmed.toLowerCase().startsWith(item),
  );
  if (!prefix) {
    return { ok: false, reason: "unsupported_format" };
  }
  const base64 = trimmed.slice(prefix.length);
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > LOGO_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: false, reason: "remote_url_forbidden" };
  }
  return { ok: true, dataUrl: trimmed };
}

export function sanitizeBrandColor(hex: string | undefined): string | undefined {
  if (!hex?.trim()) return undefined;
  const cleaned = hex.trim().replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(cleaned)) return undefined;
  return cleaned;
}

export async function getWordCompanyBrand(
  userId: string,
): Promise<WordCompanyBrand | null> {
  const mem = getBrandBucket().get(userId);
  if (mem) return mem;

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data, error } = await client
      .from("atlas_word_company_brand")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      user_id: string;
      company_name?: string | null;
      department_name?: string | null;
      contact_name?: string | null;
      postal_code?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
      website?: string | null;
      logo_data_url?: string | null;
      brand_color_hex?: string | null;
      footer_text?: string | null;
      default_font?: string | null;
      default_template_id?: string | null;
      updated_at: string;
    };
    const brand: WordCompanyBrand = {
      userId: row.user_id,
      companyName: row.company_name ?? undefined,
      departmentName: row.department_name ?? undefined,
      contactName: row.contact_name ?? undefined,
      postalCode: row.postal_code ?? undefined,
      address: row.address ?? undefined,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      website: row.website ?? undefined,
      logoDataUrl: row.logo_data_url ?? undefined,
      brandColorHex: sanitizeBrandColor(row.brand_color_hex ?? undefined),
      footerText: row.footer_text ?? undefined,
      defaultFont: row.default_font ?? undefined,
      defaultTemplateId: row.default_template_id ?? undefined,
      updatedAt: row.updated_at,
    };
    getBrandBucket().set(userId, brand);
    return brand;
  } catch {
    return null;
  }
}

export async function saveWordCompanyBrand(
  userId: string,
  patch: Partial<Omit<WordCompanyBrand, "userId" | "updatedAt">>,
): Promise<WordCompanyBrand> {
  const current = (await getWordCompanyBrand(userId)) ?? {
    userId,
    updatedAt: new Date().toISOString(),
  };

  let logoDataUrl = patch.logoDataUrl ?? current.logoDataUrl;
  if (patch.logoDataUrl !== undefined) {
    if (!patch.logoDataUrl) {
      logoDataUrl = undefined;
    } else {
      const validated = validateWordLogoDataUrl(patch.logoDataUrl);
      if (!validated.ok) {
        throw new Error(`logo_${validated.reason}`);
      }
      logoDataUrl = validated.dataUrl;
    }
  }

  const next: WordCompanyBrand = {
    ...current,
    ...patch,
    userId,
    logoDataUrl,
    brandColorHex: sanitizeBrandColor(
      patch.brandColorHex ?? current.brandColorHex,
    ),
    updatedAt: new Date().toISOString(),
  };

  getBrandBucket().set(userId, next);

  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      await client.from("atlas_word_company_brand").upsert({
        user_id: userId,
        company_name: next.companyName ?? null,
        department_name: next.departmentName ?? null,
        contact_name: next.contactName ?? null,
        postal_code: next.postalCode ?? null,
        address: next.address ?? null,
        phone: next.phone ?? null,
        email: next.email ?? null,
        website: next.website ?? null,
        logo_data_url: next.logoDataUrl ?? null,
        brand_color_hex: next.brandColorHex ?? null,
        footer_text: next.footerText ?? null,
        default_font: next.defaultFont ?? null,
        default_template_id: next.defaultTemplateId ?? null,
        updated_at: next.updatedAt,
      } as never);
    }
  } catch (error) {
    console.warn("[word-company-brand] upsert failed", error);
  }

  return next;
}

/** Format lines for Word header/footer — omit missing fields (no fiction). */
export function formatCompanyLetterhead(brand: WordCompanyBrand | null): {
  lines: string[];
  footer: string | null;
  accentHex: string | null;
  logoDataUrl: string | null;
} {
  if (!brand) {
    return { lines: [], footer: null, accentHex: null, logoDataUrl: null };
  }
  const lines: string[] = [];
  if (brand.companyName) lines.push(brand.companyName);
  if (brand.departmentName) lines.push(brand.departmentName);
  if (brand.contactName) lines.push(brand.contactName);
  if (brand.postalCode || brand.address) {
    lines.push(
      [brand.postalCode ? `〒${brand.postalCode}` : null, brand.address]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (brand.phone) lines.push(`TEL: ${brand.phone}`);
  if (brand.email) lines.push(brand.email);
  if (brand.website) lines.push(brand.website);

  return {
    lines,
    footer: brand.footerText?.trim() || null,
    accentHex: brand.brandColorHex ?? null,
    logoDataUrl: brand.logoDataUrl ?? null,
  };
}
