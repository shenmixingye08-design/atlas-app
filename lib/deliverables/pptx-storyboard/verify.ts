import JSZip from "jszip";

export type PptxVerifyReason =
  | "invalid_zip"
  | "pptx_reopen_failed"
  | "no_slides"
  | "empty_slide"
  | "overflow_risk"
  | "missing_rel"
  | "english_chrome";

export type PptxVerifyResult = {
  ok: boolean;
  reasons: PptxVerifyReason[];
  slideCount: number;
  titles: string[];
  tableCount: number;
  chartCount: number;
  imageCount: number;
  hasTheme: boolean;
  pageSizeOk: boolean;
  fontFaces: string[];
};

const SLIDE_W_EMU = 9_144_000; // 10in
const SLIDE_H_EMU = 5_143_500; // 5.625in 16:9

function extractText(xml: string): string[] {
  const texts: string[] = [];
  const re = /<a:t[^>]*>([^<]*)<\/a:t>/g;
  for (const match of xml.matchAll(re)) {
    const t = (match[1] ?? "").trim();
    if (t) texts.push(t);
  }
  return texts;
}

function hasOverflow(xml: string, texts: string[]): boolean {
  const long = texts.some((t) => t.length > 180 && !t.startsWith("data:"));
  for (const off of xml.matchAll(/<a:off[^>]*x="([^"]+)"[^>]*y="([^"]+)"/g)) {
    const x = Number(off[1]);
    const y = Number(off[2]);
    if (x < 0 || y < 0 || x > SLIDE_W_EMU || y > SLIDE_H_EMU) return true;
  }
  return long;
}

/**
 * Re-open a generated .pptx and fail closed on corrupt / empty / overflow decks.
 */
export async function verifyPptxDeck(buffer: Buffer): Promise<PptxVerifyResult> {
  const reasons: PptxVerifyReason[] = [];
  const head = buffer.subarray(0, 2).toString("latin1");
  if (head !== "PK") {
    return {
      ok: false,
      reasons: ["invalid_zip"],
      slideCount: 0,
      titles: [],
      tableCount: 0,
      chartCount: 0,
      imageCount: 0,
      hasTheme: false,
      pageSizeOk: false,
      fontFaces: [],
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      ok: false,
      reasons: ["pptx_reopen_failed"],
      slideCount: 0,
      titles: [],
      tableCount: 0,
      chartCount: 0,
      imageCount: 0,
      hasTheme: false,
      pageSizeOk: false,
      fontFaces: [],
    };
  }

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (slidePaths.length < 1) reasons.push("no_slides");

  const titles: string[] = [];
  let tableCount = 0;
  let chartCount = 0;
  let imageCount = 0;
  const fontFaces = new Set<string>();

  for (const path of slidePaths) {
    const xml = (await zip.file(path)?.async("string")) ?? "";
    const texts = extractText(xml).filter((t) => !/^P304TMPL_/.test(t));
    // 1-char Japanese titles are valid ("表", "図"). extractText already trims.
    const visible = texts.filter((t) => t.length > 0);
    if (visible.length === 0 && !xml.includes("<a:tbl") && !xml.includes("<c:chart")) {
      reasons.push("empty_slide");
    }
    titles.push(visible[0] ?? "");
    if (xml.includes("<a:tbl")) tableCount += 1;
    if (/<a:blip[\s>]|<p:pic[\s>]/.test(xml)) imageCount += 1;
    if (hasOverflow(xml, visible)) reasons.push("overflow_risk");
    if (/\bKey points\b|\bOverview\b|\bThank you\b/i.test(visible.join(" "))) {
      reasons.push("english_chrome");
    }
    for (const match of xml.matchAll(/typeface="([^"]+)"/g)) {
      if (match[1]) fontFaces.add(match[1]);
    }
    const relPath = path
      .replace("ppt/slides/", "ppt/slides/_rels/")
      .replace(/\.xml$/, ".xml.rels");
    const rels = (await zip.file(relPath)?.async("string")) ?? "";
    if (/Target="[^"]+"/.test(rels) === false && xml.includes("r:embed")) {
      reasons.push("missing_rel");
    }
  }

  const chartFiles = Object.keys(zip.files).filter((p) =>
    /^ppt\/charts\/chart\d+\.xml$/i.test(p),
  );
  chartCount = chartFiles.length;

  const presentation = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
  const cx = Number(presentation.match(/cx="(\d+)"/)?.[1] ?? 0);
  const cy = Number(presentation.match(/cy="(\d+)"/)?.[1] ?? 0);
  const pageSizeOk =
    cx === 0 ||
    (Math.abs(cx - SLIDE_W_EMU) < 20_000 && Math.abs(cy - SLIDE_H_EMU) < 20_000);

  const hasTheme = Boolean(zip.file("ppt/theme/theme1.xml"));
  if (!hasTheme) reasons.push("missing_rel");

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    slideCount: slidePaths.length,
    titles,
    tableCount,
    chartCount,
    imageCount,
    hasTheme,
    pageSizeOk,
    fontFaces: [...fontFaces],
  };
}
