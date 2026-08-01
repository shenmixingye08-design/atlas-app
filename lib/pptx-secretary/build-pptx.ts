import PptxGenJS from "pptxgenjs";

import { PPTX_LIMITS } from "./limits";
import type {
  PresentationModel,
  SlideChart,
  SlideModel,
  SlideVisual,
} from "./types";

type Pptx = PptxGenJS;
type Slide = PptxGenJS.Slide;

function font(model: PresentationModel): string {
  return model.theme.font_family || "Yu Gothic";
}

function addFooter(
  slide: Slide,
  model: PresentationModel,
  page: number,
  total: number,
): void {
  const brand = model.theme.brand.companyName || model.theme.brand.footer || "";
  const label = [brand, `${page} / ${total}`].filter(Boolean).join("  ·  ");
  slide.addText(label, {
    x: PPTX_LIMITS.safeMarginIn,
    y: model.aspect_ratio === "4:3" ? 7.0 : 5.15,
    w: 9.0,
    h: 0.3,
    fontSize: 10,
    color: model.theme.colors.muted,
    fontFace: font(model),
    align: "right",
  });
}

function addAccentBar(pptx: Pptx, slide: Slide, model: PresentationModel): void {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.1,
    fill: { color: model.theme.colors.primary },
  });
}

function addHeading(
  pptx: Pptx,
  slide: Slide,
  model: PresentationModel,
  title: string,
): void {
  addAccentBar(pptx, slide, model);
  slide.addText(title, {
    x: PPTX_LIMITS.safeMarginIn,
    y: 0.3,
    w: 9.0,
    h: 0.7,
    fontSize: 28,
    bold: true,
    color: model.theme.colors.primary,
    fontFace: font(model),
  });
  slide.addShape(pptx.ShapeType.line, {
    x: PPTX_LIMITS.safeMarginIn,
    y: 1.0,
    w: 9.0,
    h: 0,
    line: { color: model.theme.colors.light, width: 1.5 },
  });
}

function mapChartType(pptx: Pptx, type: SlideChart["type"]) {
  switch (type) {
    case "line":
      return pptx.ChartType.line;
    case "pie":
      return pptx.ChartType.pie;
    case "scatter":
      return pptx.ChartType.scatter;
    case "area":
      return pptx.ChartType.area;
    default:
      return pptx.ChartType.bar;
  }
}

function renderChart(
  pptx: Pptx,
  slide: Slide,
  model: PresentationModel,
  chart: SlideChart,
): void {
  if (chart.type === "kpi") {
    const values = chart.series[0]?.values ?? [];
    const cats = chart.categories;
    const width = 2.6;
    cats.slice(0, 3).forEach((cat, index) => {
      const x = 0.7 + index * (width + 0.3);
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.5,
        w: width,
        h: 2.2,
        fill: { color: model.theme.colors.light },
        rectRadius: 0.1,
      });
      slide.addText(String(values[index] ?? "—"), {
        x,
        y: 1.8,
        w: width,
        h: 0.9,
        fontSize: 32,
        bold: true,
        color: model.theme.colors.primary,
        align: "center",
        fontFace: font(model),
      });
      slide.addText(cat, {
        x,
        y: 2.8,
        w: width,
        h: 0.5,
        fontSize: 14,
        color: model.theme.colors.text,
        align: "center",
        fontFace: font(model),
      });
    });
    return;
  }

  const series = chart.series.map((s) => ({
    name: s.name,
    labels: chart.categories,
    values: s.values,
  }));

  slide.addChart(mapChartType(pptx, chart.type), series, {
    x: 0.7,
    y: 1.35,
    w: 8.8,
    h: 3.4,
    showTitle: Boolean(chart.title),
    title: chart.title || "",
    showLegend: chart.showLegend !== false,
    showValue: chart.showValue === true,
    chartColors: [model.theme.colors.primary, model.theme.colors.accent, "64748B"],
    barGrouping: chart.type === "stacked_bar" ? "stacked" : "clustered",
    barGapWidthPct: 40,
  });
}

function renderVisual(
  pptx: Pptx,
  slide: Slide,
  model: PresentationModel,
  visual: SlideVisual,
): void {
  const items = visual.items.slice(0, 6);
  if (visual.type === "comparison" || visual.type === "before_after") {
    const mid = Math.ceil(items.length / 2);
    const left = items.slice(0, mid);
    const right = items.slice(mid);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6,
      y: 1.4,
      w: 4.2,
      h: 3.2,
      fill: { color: model.theme.colors.light },
      rectRadius: 0.08,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.2,
      y: 1.4,
      w: 4.2,
      h: 3.2,
      fill: { color: "F8FAFC" },
      line: { color: model.theme.colors.light, width: 1 },
      rectRadius: 0.08,
    });
    slide.addText(visual.labels?.[0] || "A", {
      x: 0.8,
      y: 1.55,
      w: 3.8,
      h: 0.4,
      bold: true,
      fontSize: 16,
      color: model.theme.colors.primary,
      fontFace: font(model),
    });
    slide.addText(visual.labels?.[1] || "B", {
      x: 5.4,
      y: 1.55,
      w: 3.8,
      h: 0.4,
      bold: true,
      fontSize: 16,
      color: model.theme.colors.accent,
      fontFace: font(model),
    });
    slide.addText(left.map((t) => `• ${t}`).join("\n"), {
      x: 0.8,
      y: 2.1,
      w: 3.8,
      h: 2.2,
      fontSize: 14,
      color: model.theme.colors.text,
      fontFace: font(model),
      valign: "top",
    });
    slide.addText(right.map((t) => `• ${t}`).join("\n"), {
      x: 5.4,
      y: 2.1,
      w: 3.8,
      h: 2.2,
      fontSize: 14,
      color: model.theme.colors.text,
      fontFace: font(model),
      valign: "top",
    });
    return;
  }

  const cardW = Math.min(2.4, 8.5 / Math.max(items.length, 1) - 0.15);
  items.forEach((item, index) => {
    const x = 0.6 + index * (cardW + 0.35);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.0,
      w: cardW,
      h: 1.8,
      fill: { color: index % 2 === 0 ? model.theme.colors.light : "F8FAFC" },
      rectRadius: 0.08,
    });
    slide.addText(`${index + 1}`, {
      x,
      y: 2.15,
      w: cardW,
      h: 0.35,
      fontSize: 12,
      bold: true,
      color: model.theme.colors.accent,
      align: "center",
      fontFace: font(model),
    });
    slide.addText(item, {
      x: x + 0.1,
      y: 2.55,
      w: cardW - 0.2,
      h: 1.05,
      fontSize: 13,
      color: model.theme.colors.text,
      align: "center",
      fontFace: font(model),
      valign: "middle",
    });
    if (index < items.length - 1) {
      slide.addShape(pptx.ShapeType.rightArrow, {
        x: x + cardW + 0.02,
        y: 2.7,
        w: 0.28,
        h: 0.28,
        fill: { color: model.theme.colors.primary },
      });
    }
  });
}

function renderBullets(
  slide: Slide,
  model: PresentationModel,
  items: string[],
  y = 1.3,
): void {
  const limited = items
    .slice(0, PPTX_LIMITS.maxBulletsPerSlide)
    .map((t) => t.slice(0, PPTX_LIMITS.maxBulletChars));
  slide.addText(
    limited.map((text) => ({
      text,
      options: { bullet: true, breakLine: true },
    })),
    {
      x: PPTX_LIMITS.safeMarginIn,
      y,
      w: 9.0,
      h: 3.5,
      fontSize: PPTX_LIMITS.bodyFontSize,
      color: model.theme.colors.text,
      fontFace: font(model),
      paraSpaceAfter: 10,
      valign: "top",
    },
  );
}

function renderSlide(
  pptx: Pptx,
  model: PresentationModel,
  slideModel: SlideModel,
  index: number,
  total: number,
): void {
  const slide = pptx.addSlide();
  const colors = model.theme.colors;

  if (slideModel.type === "title" || slideModel.type === "closing") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
      fill: { color: colors.primary },
    });
    slide.addText(slideModel.title, {
      x: 0.8,
      y: 2.0,
      w: 8.4,
      h: 1.2,
      fontSize: 34,
      bold: true,
      color: "FFFFFF",
      align: "center",
      fontFace: font(model),
    });
    const sub =
      slideModel.subtitle ||
      slideModel.content.map((c) => c.text).slice(0, 2).join(" / ");
    if (sub) {
      slide.addText(sub, {
        x: 1.0,
        y: 3.3,
        w: 8.0,
        h: 0.8,
        fontSize: 16,
        color: "E5E7EB",
        align: "center",
        fontFace: font(model),
      });
    }
    if (model.theme.brand.companyName) {
      slide.addText(model.theme.brand.companyName, {
        x: 0.8,
        y: 4.7,
        w: 8.4,
        h: 0.35,
        fontSize: 12,
        color: "CBD5E1",
        align: "center",
        fontFace: font(model),
      });
    }
  } else if (slideModel.type === "section") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
      fill: { color: colors.primary },
    });
    slide.addText(slideModel.title, {
      x: 0.8,
      y: 2.4,
      w: 8.4,
      h: 1,
      fontSize: 32,
      bold: true,
      color: "FFFFFF",
      align: "center",
      fontFace: font(model),
    });
  } else {
    addHeading(pptx, slide, model, slideModel.title);
    const bullets = slideModel.content.map((c) => c.text);

    if (slideModel.charts.length > 0) {
      if (
        bullets.length === 0 ||
        slideModel.type === "chart" ||
        slideModel.type === "kpi_cards"
      ) {
        renderChart(pptx, slide, model, {
          ...slideModel.charts[0]!,
          type:
            slideModel.type === "kpi_cards" ? "kpi" : slideModel.charts[0]!.type,
        });
      } else {
        renderBullets(slide, model, bullets.slice(0, 3), 1.2);
        renderChart(pptx, slide, model, slideModel.charts[0]!);
      }
    } else if (slideModel.visuals.length > 0) {
      if (
        bullets.length &&
        slideModel.type !== "process" &&
        slideModel.type !== "timeline"
      ) {
        renderBullets(slide, model, bullets.slice(0, 3), 1.2);
      }
      renderVisual(pptx, slide, model, slideModel.visuals[0]!);
    } else if (slideModel.table) {
      const rows = [
        slideModel.table.headers,
        ...slideModel.table.rows.slice(0, PPTX_LIMITS.maxTableRows),
      ];
      slide.addTable(
        rows.map((row, rowIndex) =>
          row.map((cell) => ({
            text: cell,
            options: {
              bold: rowIndex === 0,
              fill: { color: rowIndex === 0 ? colors.light : "FFFFFF" },
              color: colors.text,
              align: "left" as const,
              fontFace: font(model),
              fontSize: 12,
            },
          })),
        ),
        {
          x: 0.6,
          y: 1.3,
          w: 9.0,
          colW: Array.from(
            { length: slideModel.table.headers.length },
            () => 9.0 / Math.max(1, slideModel.table!.headers.length),
          ),
          border: { pt: 0.5, color: "CBD5E1" },
        },
      );
    } else if (slideModel.type === "cta") {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 1.2,
        y: 1.8,
        w: 7.6,
        h: 2.6,
        fill: { color: colors.light },
        rectRadius: 0.12,
      });
      renderBullets(slide, model, bullets, 2.1);
    } else {
      renderBullets(slide, model, bullets);
    }

    addFooter(slide, model, index + 1, total);
  }

  if (slideModel.speaker_notes.trim()) {
    slide.addNotes(slideModel.speaker_notes);
  }

  if (
    model.theme.brand.logoBase64 &&
    slideModel.type !== "title" &&
    slideModel.type !== "closing" &&
    slideModel.type !== "section"
  ) {
    try {
      slide.addImage({
        data: `data:${model.theme.brand.logoMimeType || "image/png"};base64,${model.theme.brand.logoBase64}`,
        x: 0.4,
        y: model.aspect_ratio === "4:3" ? 6.9 : 5.05,
        w: 0.55,
        h: 0.35,
      });
    } catch {
      // ignore bad logo
    }
  }
}

export async function writePptxBuffer(model: PresentationModel): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = model.aspect_ratio === "4:3" ? "LAYOUT_4x3" : "LAYOUT_16x9";
  pptx.author = model.theme.brand.companyName || "MINERVOT";
  pptx.title = model.presentation_title;
  pptx.subject = model.purpose;

  const total = model.slides.length;
  for (let i = 0; i < total; i += 1) {
    renderSlide(pptx, model, model.slides[i]!, i, total);
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

export function toPreviewPayload(model: PresentationModel) {
  return {
    title: model.presentation_title,
    kind: model.kind,
    aspectRatio: model.aspect_ratio,
    themeId: model.theme.style,
    slideCount: model.slides.length,
    slides: model.slides.map((s) => ({
      slideNumber: s.slide_number,
      type: s.type,
      title: s.title,
      previewText: s.content
        .map((c) => c.text)
        .join(" / ")
        .slice(0, 160),
      hasChart: s.charts.length > 0,
      hasVisual: s.visuals.length > 0,
      hasNotes: Boolean(s.speaker_notes.trim()),
      estimatedSeconds: s.estimated_seconds ?? 40,
    })),
    warnings: model.warnings,
    assumptions: model.assumptions,
    scaleGuidance: "",
  };
}
