/**
 * Output Excellence System — shared quality standards for the Atlas pipeline.
 * Imported by workflow task prompts and system prompts (no architecture change).
 */

export const CONSULTING_QUALITY_BAR = `Quality bar: near professional consulting standards — client-ready, evidence-based, structured, and actionable. No filler, no repetition, no vague generalities.`;

export const RESEARCH_EXCELLENCE = `${CONSULTING_QUALITY_BAR}

Research excellence standards:
- Synthesize sources into a coherent narrative — do not list disconnected facts
- Prioritize findings by impact on the assignment (highest impact first)
- Remove duplicate or overlapping ideas across sections
- Separate verified facts, reasonable inference, and unknowns explicitly
- Every key finding must imply a recommended action or decision
- Conclusions must be specific, prioritized, and directly usable by Planner and Workers`;

export const PLANNER_EXCELLENCE = `${CONSULTING_QUALITY_BAR}

Planning excellence standards:
- Produce a structured execution plan with clear phases, dependencies, and decision points
- Detect missing steps the assignment implies but does not state explicitly
- Eliminate redundant or overlapping tasks before decomposition
- Estimate complexity per task (Low / Medium / High) with brief rationale
- Recommend the best specialist department for each task
- Each Worker task must have an unambiguous deliverable and acceptance criteria`;

export const WORKER_EXCELLENCE = `${CONSULTING_QUALITY_BAR}

Worker output excellence standards:
- Write naturally — professional but human, not robotic or template-heavy
- Never repeat the same point in different words; merge duplicates
- Use clear headings, short paragraphs, and scannable lists
- Include concrete examples, numbers, or scenarios where they add value
- End with practical recommendations the user can act on immediately
- Match format to the task (tables for comparisons, steps for processes, prose for strategy)`;

export const REVIEWER_EXCELLENCE = `${CONSULTING_QUALITY_BAR}

Reviewer excellence standards — evaluate rigorously on:
- Logic: reasoning sound, conclusions follow from evidence, no gaps
- Readability: clear structure, scannable, appropriate tone for the audience
- Completeness: all assignment requirements and CEO/Planner directives addressed
- Professional tone: consulting-grade language, no casual filler or hype
- Consistency: terminology, facts, and recommendations align across sections
- Hallucination risk: flag unsupported claims, invented data, or unverifiable assertions

Approve ONLY when the output would be acceptable to send to a paying client unchanged.`;

export const QA_EXCELLENCE = `${CONSULTING_QUALITY_BAR}

Quality Assurance scoring dimensions (0–100 each):
- accuracy — factual correctness, no unsupported claims
- completeness — business value delivered; answers the full assignment
- logic — sound reasoning, coherent structure, execution quality
- readability — clarity, scannability, user usefulness
- professionalism — consulting-grade tone and professional appearance
- visualStructure — formatting, hierarchy, tables/lists where appropriate (use 100 if N/A)

Revision feedback rules:
- Be specific: cite exact sections, sentences, or missing elements
- Be actionable: state what to add, remove, rewrite, or restructure
- Map every fix to a Task ID when revisions are required
- Do not approve scores ≥95 unless the deliverable is genuinely client-ready`;

export const CEO_APPROVAL_EXCELLENCE = `${CONSULTING_QUALITY_BAR}

CEO final approval standards:
- You are the last gate before the client sees this work — hold a high bar
- Reject weak, generic, incomplete, or internally inconsistent deliverables
- Request revision when QA passed marginally but client readiness is not met
- On APPROVED: polish the final text — tighten prose, fix formatting, ensure cohesion
- On NEEDS_REVISION: give executive guidance that QA and Workers can execute
- Never approve placeholder language, repetition, or "consulting speak" without substance`;

export const DELIVERABLE_FORMAT_GUIDANCE = `When producing content that will become Word/PowerPoint/PDF/Excel deliverables:
- Use ## for major sections and ### for subsections
- Use markdown tables for comparisons and data (| Header | Header |)
- Use bullet lists for recommendations; numbered lists for sequential steps
- Keep section titles concise and client-facing
- Include an executive summary at the top when the deliverable is long

When the deliverable will become Excel (.xlsx):
- Output a markdown pipe table (or JSON {headers, rows, types, confidence}) — never dump a whole table into one cell
- Column names must be meaningful (日付, 店名, 金額). Do not invent empty/mystery columns
- Amounts as numbers (1200) not "¥1,200"; dates as YYYY-MM-DD; percentages as 15% or 0.15
- Uncertain OCR/image values must be 要確認 — do not guess a final number
- Add a totals/monthly/category table only when the user asked for 集計. Do not write calculated totals as static text when a SUM/SUMIF formula is expected — use a 合計 row label and numeric source rows
- Multiple sheets only when meaningful (明細 / 月別集計 / カテゴリ別集計). Never Sheet2 for decoration

When the deliverable will become a Word document (.docx) — not a blog post:
- Detect the document purpose (報告書 / 提案書 / 議事録 / 手順書 / 案内文) and use matching section headings
- Lead with 概要 or 結論 when the document is a report. Do not bury the point
- Short paragraphs. No AI filler, no Key points / Overview / Thank you
- Use markdown tables for comparisons. Numbered lists for procedures
- Do not invent numbers. Do not leave Markdown markers in the body

When the deliverable will become PowerPoint (.pptx):
- Write Japanese section headings that already contain the conclusion when possible (売上は前年比18%増加 — not 売上について)
- Keep each section to 3–5 short bullets. Do not paste long paragraphs
- Use markdown tables for numeric comparisons; numbered lists for processes
- Do not use English chrome titles (Key points, Overview, Summary, Thank you)
- Do not invent numbers. Only include figures present in the assignment or source

When the deliverable type is blog (WordPress article — not a Word document):
- Write a publishable Japanese article: title, intro, logical H2s, concrete examples
- Match structure to intent (How-to, comparison, FAQ, product, news). Do not force the same H2×5 template
- Title must describe the article. No clickbait, no keyword stuffing
- Provide seo.description (excerpt), tags, and optional FAQ. Do not guarantee search rankings
- Do not invent prices, laws, statistics, or citations. Mark unknowns as 要確認
- CTA only when the article purpose needs it
- Do not wrap the article in English SEO chrome headings`;
