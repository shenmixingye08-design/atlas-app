import type { WordCompanyBrand } from "@/lib/deliverables/company-brand";
import type { WordTemplateId } from "@/lib/deliverables/word-templates";
import { isWordTemplateId } from "@/lib/deliverables/word-templates";
import type {
  BuildOverlaysInput,
  MemoryContentOverlay,
  MemoryDeliverableOverlay,
} from "@/lib/memory-apply/types";
import type { ResolvedMemoryValue } from "@/lib/personal-memory/types";

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
  }
  const single = asString(value);
  return single ? [single] : [];
}

function readField(
  values: readonly ResolvedMemoryValue[],
  keys: readonly string[],
): string | null {
  for (const row of values) {
    for (const key of keys) {
      if (row.key === key) {
        const direct = asString(row.value[key]) ?? asString(row.value.text);
        if (direct) return direct;
      }
      const fromValue = asString(row.value[key]);
      if (fromValue) return fromValue;
    }
    const summaryHit = keys.find((k) =>
      row.summary.toLowerCase().includes(k.replace(/_/g, " ")),
    );
    if (summaryHit && row.summary.trim()) return row.summary.trim();
  }
  return null;
}

function mergeDict(values: readonly ResolvedMemoryValue[]): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const row of values) {
    const raw = row.value.dictionary ?? row.value.corrections ?? row.value.ocrDictionary;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [from, to] of Object.entries(raw as Record<string, unknown>)) {
        const toText = asString(to);
        if (from.trim() && toText) dict[from.trim()] = toText;
      }
    }
    const from = asString(row.value.from) ?? asString(row.value.incorrect);
    const to = asString(row.value.to) ?? asString(row.value.correct);
    if (from && to) dict[from] = to;
  }
  return dict;
}

export function buildContentOverlay(input: {
  values: readonly ResolvedMemoryValue[];
  injectionText?: string;
}): MemoryContentOverlay {
  const { values } = input;
  const writingStyle =
    readField(values, ["writing_style", "style", "文体"]) ??
    values.find((v) => v.scope === "writing_style")?.summary ??
    null;
  const tone =
    readField(values, ["tone", "honorific", "敬称", "politeness"]) ?? null;
  const forbidden = values.flatMap((v) =>
    asStringArray(v.value.forbiddenExpressions ?? v.value.forbidden),
  );
  const signature =
    readField(values, ["signature", "署名", "sign_off"]) ?? null;

  const contactLines: string[] = [];
  for (const key of [
    "companyName",
    "company_name",
    "department",
    "departmentName",
    "title",
    "role",
    "address",
    "phone",
    "email",
  ] as const) {
    const hit = readField(values, [key]);
    if (hit) contactLines.push(hit);
  }
  for (const row of values.filter((v) => v.scope === "contact_info")) {
    for (const [k, v] of Object.entries(row.value)) {
      const text = asString(v);
      if (text && !contactLines.includes(text) && k !== "password") {
        contactLines.push(`${k}: ${text}`);
      }
    }
  }

  const workStyleNotes = values
    .filter(
      (v) =>
        v.scope === "work_content_style" ||
        v.scope === "recurring_work_preferences",
    )
    .map((v) => v.summary)
    .filter(Boolean);

  const visionHints = values
    .filter(
      (v) =>
        v.key.startsWith("vision_") ||
        v.scope === "document_design" ||
        v.scope === "preferred_formats",
    )
    .map((v) => v.summary)
    .filter(Boolean);

  return {
    injectionText: input.injectionText?.trim() ?? "",
    writingStyle,
    tone,
    forbiddenExpressions: [...new Set(forbidden)],
    signature,
    contactLines: [...new Set(contactLines)].slice(0, 20),
    workStyleNotes: [...new Set(workStyleNotes)].slice(0, 20),
    ocrDictionary: mergeDict(
      values.filter(
        (v) =>
          v.key.includes("ocr") ||
          v.scope === "work_content_style" ||
          v.scope === "contact_info",
      ),
    ),
    visionHints: [...new Set(visionHints)].slice(0, 20),
  };
}

export function buildDeliverableOverlay(
  input: BuildOverlaysInput,
): MemoryDeliverableOverlay {
  const { values, userId, brandFallback } = input;
  const companyName =
    readField(values, ["companyName", "company_name", "会社名"]) ??
    brandFallback?.companyName ??
    null;
  const author =
    readField(values, ["contactName", "author", "担当者"]) ??
    brandFallback?.contactName ??
    null;
  const footerNote =
    readField(values, ["footerText", "footer", "footerNote", "署名"]) ??
    brandFallback?.footerText ??
    null;
  const brandColorHex =
    readField(values, ["brandColorHex", "brand_color", "color"]) ??
    brandFallback?.brandColorHex ??
    null;
  const defaultFont =
    readField(values, ["defaultFont", "font", "フォント"]) ??
    brandFallback?.defaultFont ??
    null;

  const templateRaw =
    readField(values, ["templateId", "word_template", "defaultTemplateId"]) ??
    brandFallback?.defaultTemplateId ??
    null;
  const templateId =
    templateRaw && isWordTemplateId(templateRaw) ? templateRaw : null;

  const brand: WordCompanyBrand | null =
    companyName ||
    author ||
    footerNote ||
    brandColorHex ||
    defaultFont ||
    brandFallback
      ? {
          userId,
          companyName: companyName ?? brandFallback?.companyName,
          departmentName:
            readField(values, ["departmentName", "department", "部署"]) ??
            brandFallback?.departmentName,
          contactName: author ?? brandFallback?.contactName,
          postalCode:
            readField(values, ["postalCode", "postal_code"]) ??
            brandFallback?.postalCode,
          address:
            readField(values, ["address", "住所"]) ?? brandFallback?.address,
          phone: readField(values, ["phone", "電話"]) ?? brandFallback?.phone,
          email: readField(values, ["email", "メール"]) ?? brandFallback?.email,
          website: readField(values, ["website"]) ?? brandFallback?.website,
          logoDataUrl: brandFallback?.logoDataUrl,
          brandColorHex: brandColorHex ?? brandFallback?.brandColorHex,
          footerText: footerNote ?? brandFallback?.footerText,
          defaultFont: defaultFont ?? brandFallback?.defaultFont,
          defaultTemplateId:
            (templateId as WordTemplateId | undefined) ??
            brandFallback?.defaultTemplateId,
          updatedAt: new Date().toISOString(),
        }
      : null;

  const excelCurrency = readField(values, ["currency", "通貨"]);
  const excelDate = readField(values, ["date_format", "dateFormat", "日付"]);
  const decimalRaw = readField(values, ["decimalPlaces", "decimals"]);
  const decimalPlaces = decimalRaw != null ? Number(decimalRaw) : null;

  const columnOrder = values.flatMap((v) =>
    asStringArray(v.value.columnOrder ?? v.value.columns),
  );

  return {
    brand,
    templateId,
    companyName,
    author,
    footerNote,
    brandColorHex,
    defaultFont,
    excel: {
      headerColorArgb: brandColorHex
        ? `FF${brandColorHex.replace(/^#/, "").toUpperCase()}`
        : "FF1F4E79",
      currency: excelCurrency,
      dateFormat: excelDate,
      decimalPlaces:
        decimalPlaces != null && Number.isFinite(decimalPlaces)
          ? decimalPlaces
          : null,
      columnOrder: [...new Set(columnOrder)],
    },
    powerpoint: {
      brandColorHex: brandColorHex?.replace(/^#/, "") ?? null,
      fontFace: defaultFont,
      titleAlign: "center",
    },
    pdf: {
      brandColorHex: brandColorHex?.replace(/^#/, "") ?? null,
      footerNote,
      marginPt: null,
    },
    memoryIdsUsed: values.map((v) => v.memoryId).filter((id) => !id.startsWith("override:")),
    scopesUsed: [...new Set(values.map((v) => v.scope))],
  };
}

/** Apply content overlay into a plain-text / markdown deliverable body. */
export function applyContentOverlayToText(
  base: string,
  overlay: MemoryContentOverlay,
): string {
  const parts: string[] = [];
  if (overlay.injectionText) {
    parts.push(overlay.injectionText);
  }
  if (overlay.writingStyle) {
    parts.push(`【文体】${overlay.writingStyle}`);
  }
  if (overlay.tone) {
    parts.push(`【敬称・トーン】${overlay.tone}`);
  }
  if (overlay.forbiddenExpressions.length > 0) {
    parts.push(`【禁止表現】${overlay.forbiddenExpressions.join("、")}`);
  }
  if (overlay.workStyleNotes.length > 0) {
    parts.push(`【仕事の書き方】${overlay.workStyleNotes.join(" / ")}`);
  }
  if (overlay.contactLines.length > 0) {
    parts.push(`【連絡先】\n${overlay.contactLines.join("\n")}`);
  }

  let body = base.trim();
  // Strip forbidden expressions when Memory ON
  for (const forbidden of overlay.forbiddenExpressions) {
    if (!forbidden) continue;
    body = body.split(forbidden).join("");
  }

  const header = parts.length > 0 ? `${parts.join("\n")}\n\n` : "";
  const signature = overlay.signature ? `\n\n${overlay.signature}` : "";
  return `${header}${body}${signature}`.trim();
}
