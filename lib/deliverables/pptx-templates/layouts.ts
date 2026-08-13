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

export function paintKpiCards(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  cards: Array<{ label: string; value: string }>,
  design: ResolvedPptxDesign,
): void {
  const origin = contentBodyOrigin(design);
  const ShapeType = getShapeType(pptx);
  const count = Math.min(Math.max(cards.length, 1), 4);
  const gap = 0.2;
  const width = (origin.w - gap * (count - 1)) / count;
  cards.slice(0, count).forEach((card, index) => {
    const x = origin.x + index * (width + gap);
    slide.addShape(ShapeType.roundRect, {
      x,
      y: origin.y,
      w: width,
      h: 2.1,
      fill: { color: index === 0 ? design.colors.accent : design.colors.accentLight },
      rectRadius: 0.08,
    });
    slide.addText(card.value, {
      x,
      y: origin.y + 0.35,
      w: width,
      h: 0.9,
      fontSize: 22,
      bold: true,
      color: index === 0 ? design.colors.onAccent : design.colors.accent,
      align: "center",
      fontFace: design.fontFace,
    });
    slide.addText(card.label, {
      x: x + 0.08,
      y: origin.y + 1.3,
      w: width - 0.16,
      h: 0.55,
      fontSize: 12,
      color: index === 0 ? design.colors.accentLight : design.colors.muted,
      align: "center",
      fontFace: design.fontFace,
    });
  });
}

export function paintKeyNumber(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  value: string,
  label: string,
  design: ResolvedPptxDesign,
): void {
  const origin = contentBodyOrigin(design);
  slide.addText(value, {
    x: origin.x,
    y: origin.y + 0.4,
    w: origin.w,
    h: 1.4,
    fontSize: 40,
    bold: true,
    color: design.colors.accent,
    align: "center",
    fontFace: design.fontFace,
  });
  slide.addText(label, {
    x: origin.x,
    y: origin.y + 2.0,
    w: origin.w,
    h: 0.6,
    fontSize: 16,
    color: design.colors.muted,
    align: "center",
    fontFace: design.fontFace,
  });
}

export function paintTwoColumn(
  _pptx: pptxgen,
  slide: pptxgen.Slide,
  left: string[],
  right: string[],
  design: ResolvedPptxDesign,
): void {
  const origin = contentBodyOrigin(design);
  const colW = (origin.w - 0.3) / 2;
  slide.addText(left.map((item) => ({ text: item, options: { bullet: true } })), {
    x: origin.x,
    y: origin.y,
    w: colW,
    h: 3.8,
    fontSize: 16,
    color: design.colors.text,
    fontFace: design.fontFace,
    valign: "top",
    paraSpaceAfter: 8,
  });
  slide.addText(right.map((item) => ({ text: item, options: { bullet: true } })), {
    x: origin.x + colW + 0.3,
    y: origin.y,
    w: colW,
    h: 3.8,
    fontSize: 16,
    color: design.colors.text,
    fontFace: design.fontFace,
    valign: "top",
    paraSpaceAfter: 8,
  });
}

export function paintComparison(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  comparison: { leftTitle: string; rightTitle: string; left: string[]; right: string[] },
  design: ResolvedPptxDesign,
): void {
  const origin = contentBodyOrigin(design);
  const ShapeType = getShapeType(pptx);
  const colW = (origin.w - 0.3) / 2;
  slide.addShape(ShapeType.roundRect, {
    x: origin.x,
    y: origin.y,
    w: colW,
    h: 3.9,
    fill: { color: design.colors.accentLight },
    rectRadius: 0.06,
  });
  slide.addShape(ShapeType.roundRect, {
    x: origin.x + colW + 0.3,
    y: origin.y,
    w: colW,
    h: 3.9,
    fill: { color: "F7F9FC" },
    line: { color: design.colors.accent, width: 1.25 },
    rectRadius: 0.06,
  });
  slide.addText(comparison.leftTitle, {
    x: origin.x + 0.15,
    y: origin.y + 0.15,
    w: colW - 0.3,
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: design.colors.accent,
    fontFace: design.fontFace,
  });
  slide.addText(comparison.rightTitle, {
    x: origin.x + colW + 0.45,
    y: origin.y + 0.15,
    w: colW - 0.3,
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: design.colors.accent,
    fontFace: design.fontFace,
  });
  slide.addText(
    comparison.left.map((item) => ({ text: item, options: { bullet: true } })),
    {
      x: origin.x + 0.15,
      y: origin.y + 0.65,
      w: colW - 0.3,
      h: 3.0,
      fontSize: 14,
      color: design.colors.text,
      fontFace: design.fontFace,
      valign: "top",
    },
  );
  slide.addText(
    comparison.right.map((item) => ({ text: item, options: { bullet: true } })),
    {
      x: origin.x + colW + 0.45,
      y: origin.y + 0.65,
      w: colW - 0.3,
      h: 3.0,
      fontSize: 14,
      color: design.colors.text,
      fontFace: design.fontFace,
      valign: "top",
    },
  );
}

export function paintProcess(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  steps: string[],
  design: ResolvedPptxDesign,
  variant: "process" | "timeline" = "process",
): void {
  const origin = contentBodyOrigin(design);
  const ShapeType = getShapeType(pptx);
  const count = Math.min(steps.length, 5);
  const gap = 0.16;
  const width = (origin.w - gap * (count - 1)) / count;
  steps.slice(0, count).forEach((step, index) => {
    const x = origin.x + index * (width + gap);
    slide.addShape(ShapeType.roundRect, {
      x,
      y: origin.y,
      w: width,
      h: 3.4,
      fill: { color: "F7F9FC" },
      line: { color: design.colors.accentLight, width: 1 },
      rectRadius: 0.06,
    });
    slide.addShape(ShapeType.ellipse, {
      x: x + width / 2 - 0.22,
      y: origin.y + 0.2,
      w: 0.44,
      h: 0.44,
      fill: { color: design.colors.accent },
    });
    slide.addText(String(index + 1), {
      x: x + width / 2 - 0.22,
      y: origin.y + 0.24,
      w: 0.44,
      h: 0.38,
      fontSize: 12,
      bold: true,
      color: design.colors.onAccent,
      align: "center",
      fontFace: design.fontFace,
    });
    if (variant === "timeline" && index < count - 1) {
      slide.addShape(ShapeType.rect, {
        x: x + width - 0.02,
        y: origin.y + 0.4,
        w: gap + 0.04,
        h: 0.04,
        fill: { color: design.colors.accentLight },
      });
    }
    slide.addText(step, {
      x: x + 0.1,
      y: origin.y + 0.8,
      w: width - 0.2,
      h: 2.4,
      fontSize: 13,
      color: design.colors.text,
      align: "center",
      fontFace: design.fontFace,
      valign: "top",
    });
  });
}

export function paintCta(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  message: string | undefined,
  design: ResolvedPptxDesign,
): void {
  const ShapeType = getShapeType(pptx);
  slide.addShape(ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: { color: design.colors.accent },
  });
  slide.addText(title, {
    x: 0.7,
    y: 1.8,
    w: 8.6,
    h: 1.0,
    fontSize: 32,
    bold: true,
    color: design.colors.onAccent,
    align: "center",
    fontFace: design.fontFace,
  });
  if (message) {
    slide.addText(message, {
      x: 0.8,
      y: 3.1,
      w: 8.4,
      h: 0.8,
      fontSize: 16,
      color: design.colors.accentLight,
      align: "center",
      fontFace: design.fontFace,
    });
  }
}
