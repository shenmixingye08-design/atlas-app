import type { ContentBlock, ParsedDeliverable, ParsedSection } from "../parse-content";
import { tableToChartSpec, type PptxChartSpec } from "./charts";
import {
  conclusionTitle,
  extractKpis,
  limitBullets,
  PPT_LABEL,
  proseToBullets,
  sanitizeSlideTitle,
  type KpiItem,
} from "./copy";
import {
  preferredSectionOrder,
  resolvePresentationIntent,
  type PresentationIntent,
} from "./intent";

export type SlideLayoutKind =
  | "title"
  | "divider"
  | "bullets"
  | "two_column"
  | "kpi_cards"
  | "key_number"
  | "table"
  | "chart"
  | "image"
  | "comparison"
  | "process"
  | "timeline"
  | "cta"
  | "summary";

export type SlidePlan = {
  role: string;
  layout: SlideLayoutKind;
  title: string;
  message?: string;
  bullets?: string[];
  kpis?: KpiItem[];
  table?: { headers: string[]; rows: string[][] };
  chart?: PptxChartSpec;
  image?: { caption: string; dataUrl?: string };
  steps?: string[];
  comparison?: {
    leftTitle: string;
    rightTitle: string;
    left: string[];
    right: string[];
  };
  columns?: { left: string[]; right: string[] };
};

function sectionText(section: ParsedSection): string {
  return section.blocks
    .map((block) => {
      if (block.type === "paragraph") return block.text;
      if (block.type === "bulletList" || block.type === "numberedList") {
        return block.items.join("\n");
      }
      if (block.type === "table") {
        return block.rows
          .map((row) =>
            block.headers.map((header, i) => `${header} ${row[i] ?? ""}`).join(" "),
          )
          .join("\n");
      }
      return "";
    })
    .join("\n");
}

function bulletsFromSection(section: ParsedSection): string[] {
  const items: string[] = [];
  for (const block of section.blocks) {
    if (block.type === "bulletList" || block.type === "numberedList") {
      items.push(...block.items);
    } else if (block.type === "paragraph") {
      items.push(...proseToBullets(block.text, 5));
    }
  }
  return items;
}

function rankSection(title: string, preferred: string[]): number {
  const idx = preferred.findIndex((key) => title.includes(key));
  return idx >= 0 ? idx : 100 + title.length;
}

function orderSections(
  sections: ParsedSection[],
  intent: PresentationIntent,
): ParsedSection[] {
  const preferred = preferredSectionOrder(intent);
  if (preferred.length === 0) return sections;
  return [...sections].sort(
    (a, b) => rankSection(a.title, preferred) - rankSection(b.title, preferred),
  );
}

function isComparisonTitle(title: string): boolean {
  return /比較|対比|現行|提案後|before|after|改善前|vs/i.test(title);
}

function comparisonLabels(title: string): { leftTitle: string; rightTitle: string } {
  if (/before|after|改善前|改善後/i.test(title)) {
    return { leftTitle: "改善前", rightTitle: "改善後" };
  }
  if (/課題|問題/.test(title)) {
    return { leftTitle: "課題", rightTitle: "解決" };
  }
  return { leftTitle: "現行", rightTitle: "提案" };
}

function isProcessTitle(title: string): boolean {
  return /手順|プロセス|流れ|ステップ|導入方法|スケジュール/i.test(title);
}

function isTimelineTitle(title: string): boolean {
  return /スケジュール|タイムライン|工程|フェーズ|月次計画/i.test(title);
}

function splitComparison(
  items: string[],
  title: string,
): SlidePlan["comparison"] {
  if (items.length < 2) return undefined;
  const labels = comparisonLabels(title);
  const mid = Math.ceil(items.length / 2);
  return {
    leftTitle: labels.leftTitle,
    rightTitle: labels.rightTitle,
    left: items.slice(0, mid).slice(0, 5),
    right: items.slice(mid).slice(0, 5),
  };
}

function plansFromBlocks(
  section: ParsedSection,
  intent: PresentationIntent,
  includeDivider: boolean,
): SlidePlan[] {
  const plans: SlidePlan[] = [];
  if (includeDivider) {
    plans.push({
      role: "section",
      layout: "divider",
      title: sanitizeSlideTitle(section.title),
    });
  }

  const tables = section.blocks.filter(
    (b): b is Extract<ContentBlock, { type: "table" }> => b.type === "table",
  );
  const images = section.blocks.filter(
    (b): b is Extract<ContentBlock, { type: "imagePlaceholder" }> =>
      b.type === "imagePlaceholder",
  );
  const numbered = section.blocks.find((b) => b.type === "numberedList");
  const bullets = bulletsFromSection(section);
  const kpis = extractKpis(sectionText(section));
  const title = conclusionTitle(section.title, bullets);

  if (kpis.length >= 2 && tables.length === 0) {
    plans.push({
      role: "content",
      layout: kpis.length === 1 ? "key_number" : "kpi_cards",
      title,
      kpis,
      message: kpis[0] ? `${kpis[0].label} ${kpis[0].value}` : undefined,
    });
  }

  if (isComparisonTitle(section.title) && bullets.length >= 2) {
    const comparison = splitComparison(bullets, section.title);
    if (comparison) {
      plans.push({
        role: "content",
        layout: "comparison",
        title,
        comparison,
      });
    }
  } else if (
    (isProcessTitle(section.title) || numbered?.type === "numberedList") &&
    (numbered?.type === "numberedList" ? numbered.items.length : bullets.length) >= 3
  ) {
    const steps =
      numbered?.type === "numberedList" ? numbered.items.slice(0, 6) : bullets.slice(0, 6);
    plans.push({
      role: "content",
      layout: isTimelineTitle(section.title) ? "timeline" : "process",
      title,
      steps,
    });
  } else if (bullets.length > 5 && !tables.length) {
    const [left, right] = [
      bullets.slice(0, Math.ceil(bullets.length / 2)).slice(0, 4),
      bullets.slice(Math.ceil(bullets.length / 2)).slice(0, 4),
    ];
    plans.push({
      role: "content",
      layout: "two_column",
      title,
      columns: { left, right },
    });
  } else if (bullets.length > 0 && tables.length === 0 && images.length === 0) {
    for (const chunk of limitBullets(bullets, 5)) {
      if (chunk.length === 0) continue;
      plans.push({
        role: "content",
        layout: "bullets",
        title,
        bullets: chunk,
        message: chunk[0],
      });
    }
  }

  for (const table of tables) {
    const chart =
      table.rows.length <= 8
        ? tableToChartSpec({
            title: section.title,
            headers: table.headers,
            rows: table.rows,
          })
        : null;
    if (chart && intent !== "howto") {
      plans.push({
        role: "content",
        layout: "chart",
        title: sanitizeSlideTitle(`${section.title}の数値`),
        chart,
      });
    }
    const rowChunks: string[][][] = [];
    if (table.rows.length === 0) {
      rowChunks.push([]);
    } else {
      for (let i = 0; i < table.rows.length; i += 8) {
        rowChunks.push(table.rows.slice(i, i + 8));
      }
    }
    for (const rows of rowChunks) {
      plans.push({
        role: "content",
        layout: "table",
        title,
        table: { headers: table.headers, rows },
      });
    }
  }

  for (const image of images) {
    plans.push({
      role: "content",
      layout: "image",
      title,
      image: { caption: image.caption, dataUrl: image.dataUrl },
    });
  }

  if (plans.every((p) => p.layout === "divider")) {
    plans.push({
      role: "content",
      layout: "bullets",
      title,
      bullets: bullets.length > 0 ? bullets.slice(0, 5) : [section.title],
    });
  }

  return plans;
}

function applySlideCountHint(plans: SlidePlan[], hint: number | null): SlidePlan[] {
  if (hint == null || plans.length <= hint) return plans;
  const droppable = new Set(["divider", "agenda"]);
  let next = plans.filter((p, idx) => {
    if (idx === 0) return true;
    if (p.layout === "table" || p.layout === "image" || p.layout === "chart") {
      return true;
    }
    return !droppable.has(p.layout) && p.role !== "agenda";
  });
  if (next.length > hint) {
    next = next.filter((p) => p.layout !== "cta" || next.length <= hint);
  }
  if (next.length > hint) {
    const keep: SlidePlan[] = [];
    for (const plan of next) {
      if (keep.length < hint) keep.push(plan);
      else if (
        plan.layout === "table" ||
        plan.layout === "image" ||
        plan.layout === "chart"
      ) {
        keep.push(plan);
      }
    }
    next = keep;
  }
  return next.length > 0 ? next : plans.slice(0, Math.max(1, hint));
}

export function buildSlideStoryboard(input: {
  parsed: ParsedDeliverable;
  assignment?: string | null;
  showAgenda: boolean;
  showSectionDividers: boolean;
  showClosing: boolean;
  slideCountHint: number | null;
}): { intent: PresentationIntent; slides: SlidePlan[] } {
  const intent = resolvePresentationIntent({
    assignment: input.assignment,
    title: input.parsed.title,
    sectionTitles: input.parsed.sections.map((s) => s.title),
  });
  const sections = orderSections(input.parsed.sections, intent);
  const slides: SlidePlan[] = [
    {
      role: "title",
      layout: "title",
      title: sanitizeSlideTitle(input.parsed.title),
      message: input.parsed.subtitle,
    },
  ];

  if (input.showAgenda && sections.length >= 2) {
    slides.push({
      role: "agenda",
      layout: "summary",
      title: PPT_LABEL.agenda,
      bullets: sections.map((s) => sanitizeSlideTitle(s.title)).slice(0, 6),
    });
  }

  const includeDivider =
    input.showSectionDividers &&
    sections.length >= 2 &&
    (input.slideCountHint == null || input.slideCountHint >= 8);

  for (const section of sections) {
    slides.push(...plansFromBlocks(section, intent, includeDivider));
  }

  const summaryBullets = sections
    .slice(0, 5)
    .map((s) => {
      const first = bulletsFromSection(s)[0];
      return first ? sanitizeSlideTitle(`${s.title}：${first}`) : sanitizeSlideTitle(s.title);
    });
  slides.push({
    role: "summary",
    layout: "summary",
    title:
      intent === "internal_report" || intent === "exec_report"
        ? "結論"
        : PPT_LABEL.summary,
    bullets: summaryBullets.slice(0, 5),
  });

  if (input.showClosing) {
    slides.push({
      role: "cta",
      layout: intent === "sales_proposal" ? "cta" : "divider",
      title: intent === "sales_proposal" ? PPT_LABEL.cta : PPT_LABEL.next,
      bullets:
        intent === "sales_proposal"
          ? ["内容をご確認のうえ、次の打ち合わせで進め方を合わせましょう。"]
          : undefined,
      message: input.parsed.title,
    });
  }

  const deduped: SlidePlan[] = [];
  for (const slide of slides) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.layout === slide.layout &&
      prev.title === slide.title &&
      JSON.stringify(prev.bullets ?? []) === JSON.stringify(slide.bullets ?? []) &&
      !slide.table &&
      !slide.image
    ) {
      continue;
    }
    deduped.push(slide);
  }

  return {
    intent,
    slides: applySlideCountHint(deduped, input.slideCountHint),
  };
}
