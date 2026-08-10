/**
 * Deterministic slide geometry per PPT design template (P3-04).
 */

import type pptxgen from "pptxgenjs";

import type { ResolvedPptxDesign } from "./types";

/** pptxgenjs exposes ShapeType on instances, not the constructor. */
export function getShapeType(pptx: pptxgen): pptxgen["ShapeType"] {
  return pptx.ShapeType;
}

export function paintTitleSlide(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  subtitle: string | undefined,
  design: ResolvedPptxDesign,
): void {
  const { colors, template, fontFace, titleAlign } = design;
  const ShapeType = getShapeType(pptx);

  switch (template.titleLayout) {
    case "left-stripe": {
      slide.addShape(ShapeType.rect, {
        x: 0,
        y: 0,
        w: 0.35,
        h: "100%",
        fill: { color: colors.accent },
      });
      slide.addText(title, {
        x: 0.7,
        y: 1.9,
        w: 8.5,
        h: 1.2,
        fontSize: template.titleFontSize,
        bold: true,
        color: colors.accent,
        align: "left",
        fontFace,
      });
      break;
    }
    case "minimal": {
      slide.addText(title, {
        x: 0.8,
        y: 2.1,
        w: 8.4,
        h: 1.1,
        fontSize: template.titleFontSize,
        bold: true,
        color: colors.text,
        align: titleAlign,
        fontFace,
      });
      break;
    }
    case "full-bleed": {
      slide.addShape(ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: "100%",
        fill: { color: colors.accent },
      });
      slide.addText(title, {
        x: 0.6,
        y: 2.0,
        w: 8.8,
        h: 1.3,
        fontSize: template.titleFontSize,
        bold: true,
        color: colors.onAccent,
        align: "center",
        fontFace,
      });
      break;
    }
    case "header-band": {
      slide.addShape(ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: 1.1,
        fill: { color: colors.accent },
      });
      slide.addText(title, {
        x: 0.6,
        y: 2.0,
        w: 8.8,
        h: 1.2,
        fontSize: template.titleFontSize,
        bold: true,
        color: colors.text,
        align: titleAlign,
        fontFace,
      });
      break;
    }
    case "centered-bar":
    default: {
      slide.addShape(ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: 0.12,
        fill: { color: colors.accent },
      });
      slide.addText(title, {
        x: 0.6,
        y: 1.8,
        w: 8.8,
        h: 1.2,
        fontSize: template.titleFontSize,
        bold: true,
        color: colors.accent,
        align: titleAlign,
        fontFace,
      });
      break;
    }
  }

  if (subtitle) {
    const subtitleColor =
      template.titleLayout === "full-bleed" ? colors.accentLight : colors.muted;
    slide.addText(subtitle, {
      x: 0.6,
      y: template.titleLayout === "full-bleed" ? 3.4 : 3.1,
      w: 8.8,
      h: 0.55,
      fontSize: 16,
      color: subtitleColor,
      align: template.titleLayout === "left-stripe" ? "left" : titleAlign,
      fontFace,
    });
  }

  // Hidden design marker for Production probe (not user-facing copy).
  slide.addText(template.designMarker, {
    x: 0.01,
    y: 5.35,
    w: 0.2,
    h: 0.2,
    fontSize: 1,
    color: colors.surface,
    fontFace,
  });
}

export function paintSectionDivider(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  design: ResolvedPptxDesign,
): void {
  const { colors, template, fontFace } = design;
  const ShapeType = getShapeType(pptx);

  if (template.titleLayout === "left-stripe") {
    slide.addShape(ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.45,
      h: "100%",
      fill: { color: colors.accent },
    });
    slide.addText(title, {
      x: 0.8,
      y: 2.3,
      w: 8.4,
      h: 1.0,
      fontSize: 32,
      bold: true,
      color: colors.accent,
      align: "left",
      fontFace,
    });
    return;
  }

  slide.addShape(ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: { color: colors.accent },
  });
  slide.addText(title, {
    x: 0.6,
    y: 2.3,
    w: 8.8,
    h: 1.0,
    fontSize: 34,
    bold: true,
    color: colors.onAccent,
    align: "center",
    fontFace,
  });
}

export function paintContentHeading(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  design: ResolvedPptxDesign,
): void {
  const { colors, template, fontFace } = design;
  const ShapeType = getShapeType(pptx);
  const layout = template.contentLayout;

  if (layout === "left-rail") {
    slide.addShape(ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.22,
      h: "100%",
      fill: { color: colors.accent },
    });
  }
  if (layout === "banded") {
    slide.addShape(ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: 0.85,
      fill: { color: colors.accent },
    });
    slide.addText(title, {
      x: 0.55,
      y: 0.18,
      w: 8.9,
      h: 0.55,
      fontSize: template.headingFontSize,
      bold: true,
      color: colors.onAccent,
      fontFace,
    });
    return;
  }

  const x = layout === "left-rail" ? 0.55 : 0.6;
  slide.addText(title, {
    x,
    y: layout === "wide-title" ? 0.28 : 0.35,
    w: 8.8,
    h: layout === "wide-title" ? 0.85 : 0.7,
    fontSize:
      layout === "wide-title"
        ? template.headingFontSize + 2
        : template.headingFontSize,
    bold: true,
    color: colors.accent,
    fontFace,
  });

  if (layout !== "compact") {
    slide.addShape(ShapeType.line, {
      x,
      y: layout === "wide-title" ? 1.15 : 1.05,
      w: 8.8,
      h: 0,
      line: { color: colors.accentLight, width: 2 },
    });
  }
}

export function contentBodyOrigin(design: ResolvedPptxDesign): {
  x: number;
  y: number;
  w: number;
} {
  const layout = design.template.contentLayout;
  if (layout === "left-rail") return { x: 0.65, y: 1.35, w: 8.5 };
  if (layout === "banded") return { x: 0.6, y: 1.15, w: 8.8 };
  if (layout === "wide-title") return { x: 0.6, y: 1.4, w: 8.8 };
  if (layout === "compact") return { x: 0.7, y: 1.2, w: 8.6 };
  return { x: 0.8, y: 1.3, w: 8.4 };
}
