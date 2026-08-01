import type { PresentationModel, PptxEditOperation, ThemeId } from "./types";
import { resolveTheme } from "./themes";
import { PPTX_LIMITS } from "./limits";

function renumber(slides: PresentationModel["slides"]): PresentationModel["slides"] {
  return slides.map((slide, index) => ({ ...slide, slide_number: index + 1 }));
}

export function applyPptxEdits(
  model: PresentationModel,
  operations: PptxEditOperation[],
): PresentationModel {
  let next: PresentationModel = {
    ...model,
    slides: model.slides.map((s) => ({ ...s })),
    warnings: [...model.warnings],
    assumptions: [...model.assumptions],
  };

  for (const op of operations) {
    switch (op.op) {
      case "delete_slides": {
        const remove = new Set(op.slides);
        next.slides = renumber(next.slides.filter((s) => !remove.has(s.slide_number)));
        break;
      }
      case "reorder_slides": {
        const map = new Map(next.slides.map((s) => [s.slide_number, s]));
        const ordered = op.order
          .map((n) => map.get(n))
          .filter((s): s is NonNullable<typeof s> => Boolean(s));
        if (ordered.length === next.slides.length) {
          next.slides = renumber(ordered);
        }
        break;
      }
      case "shorten_text": {
        next.slides = next.slides.map((slide) => ({
          ...slide,
          content: slide.content
            .slice(0, Math.min(3, PPTX_LIMITS.maxBulletsPerSlide))
            .map((b) => ({
              ...b,
              text: b.text.slice(0, 42),
            })),
          speaker_notes: slide.speaker_notes.split("\n").slice(0, 3).join("\n"),
        }));
        next.assumptions.push("文章を短縮しました");
        break;
      }
      case "change_theme": {
        next.theme = resolveTheme(op.theme as ThemeId, next.theme.brand);
        next.assumptions.push(`テーマを${op.theme}に変更`);
        break;
      }
      case "set_duration": {
        next.duration_minutes = op.minutes;
        const seconds = (op.minutes * 60) / Math.max(1, next.slides.length);
        next.slides = next.slides.map((s) => ({
          ...s,
          estimated_seconds: seconds,
          speaker_notes: s.speaker_notes.replace(/約\d+秒/, `約${Math.round(seconds)}秒`),
        }));
        break;
      }
      case "add_cta": {
        next.slides = renumber([
          ...next.slides.filter((s) => s.type !== "closing"),
          {
            slide_number: next.slides.length,
            type: "cta",
            title: "次のアクション",
            content: [{ text: op.text.slice(0, PPTX_LIMITS.maxBulletChars), level: 0 }],
            visuals: [],
            charts: [],
            speaker_notes: `CTA: ${op.text}\n次の一歩を明確に依頼します。`,
            source_references: [],
            layout: "cta",
            estimated_seconds: 30,
          },
          ...next.slides.filter((s) => s.type === "closing"),
        ]);
        break;
      }
      case "translate": {
        next.language = op.language;
        if (op.language === "en-US") {
          next.assumptions.push("英語ラベルへ切り替え（本文は要約レベルの英訳プレースホルダ）");
          next.slides = next.slides.map((s) => ({
            ...s,
            title: s.type === "title" ? next.presentation_title : s.title,
            speaker_notes: `Speak to the key point of: ${s.title}\n${s.speaker_notes}`,
          }));
        }
        break;
      }
      case "regenerate_notes": {
        next.slides = next.slides.map((s) => ({
          ...s,
          speaker_notes: [
            `このスライドの要点は「${s.title}」です。`,
            s.content.map((c) => c.text).slice(0, 2).join("。") + "。",
            "次のスライドへつなぎます。",
            `目安: 約${Math.round(s.estimated_seconds ?? 40)}秒`,
          ].join("\n"),
        }));
        break;
      }
    }
  }

  return next;
}
