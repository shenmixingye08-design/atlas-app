/**
 * Rewrite ppt/theme/theme1.xml accent colors to the resolved design (P3-04).
 * pptxgenjs leaves Office defaults — we make brand/template colors SoT in OOXML.
 */

import JSZip from "jszip";

export type ThemeInjectResult = {
  buffer: Buffer;
  themePatched: boolean;
  accentHex: string | null;
  error: string | null;
};

function replaceAccent(themeXml: string, accentHex: string): string {
  const hex = accentHex.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return themeXml;
  // Replace accent1..accent6 srgb values with brand-tinted scheme.
  let next = themeXml;
  next = next.replace(
    /(<a:accent1>\s*<a:srgbClr val=")[A-Fa-f0-9]{6}("\/>)/,
    `$1${hex}$2`,
  );
  next = next.replace(
    /(<a:dk2>\s*<a:srgbClr val=")[A-Fa-f0-9]{6}("\/>)/,
    `$1${hex}$2`,
  );
  // Ensure theme name reflects ATLAS design (no secrets).
  next = next.replace(
    /name="Office Theme"/,
    'name="ATLAS Design Theme"',
  );
  next = next.replace(
    /(<a:clrScheme name=")Office(")/,
    `$1ATLAS$2`,
  );
  return next;
}

export async function injectPptxThemeAccent(
  inputBuffer: Buffer,
  accentHex: string,
): Promise<ThemeInjectResult> {
  try {
    const zip = await JSZip.loadAsync(inputBuffer);
    const themeFile = zip.file("ppt/theme/theme1.xml");
    if (!themeFile) {
      return {
        buffer: inputBuffer,
        themePatched: false,
        accentHex: null,
        error: "theme_xml_missing",
      };
    }
    const original = await themeFile.async("string");
    const patched = replaceAccent(original, accentHex);
    if (patched === original) {
      return {
        buffer: inputBuffer,
        themePatched: false,
        accentHex: null,
        error: "theme_unchanged",
      };
    }
    zip.file("ppt/theme/theme1.xml", patched);
    const out = Buffer.from(
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    );
    return {
      buffer: out,
      themePatched: true,
      accentHex: accentHex.replace(/^#/, "").toUpperCase(),
      error: null,
    };
  } catch (error) {
    return {
      buffer: inputBuffer,
      themePatched: false,
      accentHex: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function inspectPptxDesignParts(buffer: Buffer): Promise<{
  hasTheme: boolean;
  accentHex: string | null;
  themeName: string | null;
  slideCount: number;
  designMarker: string | null;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const themeXml = await zip.file("ppt/theme/theme1.xml")?.async("string");
  const accent =
    themeXml?.match(/<a:accent1>\s*<a:srgbClr val="([A-Fa-f0-9]{6})"\/>/)?.[1] ??
    null;
  const themeName =
    themeXml?.match(/<a:theme[^>]*name="([^"]+)"/)?.[1] ?? null;
  const slideCount = Object.keys(zip.files).filter((p) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(p),
  ).length;

  let designMarker: string | null = null;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (!/^ppt\/slides\/slide\d+\.xml$/i.test(path)) continue;
    const text = await entry.async("string");
    const hit = text.match(/P304TMPL_[A-Z]+/);
    if (hit) {
      designMarker = hit[0]!;
      break;
    }
  }

  return {
    hasTheme: Boolean(themeXml),
    accentHex: accent ? accent.toUpperCase() : null,
    themeName,
    slideCount,
    designMarker,
  };
}
