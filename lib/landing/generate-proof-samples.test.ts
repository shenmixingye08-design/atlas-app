/**
 * Generates real landing proof samples into public/samples/.
 * Run: npx vitest run lib/landing/generate-proof-samples.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PlainTextDeliverableGenerator } from "@/lib/deliverables/generators/plain-text-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";

import {
  PROOF_DISCLAIMER,
  PROOF_DOCX_BODY,
  PROOF_EMAIL_SAMPLE,
  PROOF_PDF_BODY,
  PROOF_PPTX_BODY,
  PROOF_SNS_SAMPLE,
  PROOF_XLSX_BODY,
  creationSecFromMs,
  type ProofManifest,
  type ProofManifestEntry,
} from "./proof-samples";

const OUT_DIR = join(process.cwd(), "public", "samples");

describe("landing proof sample generation", () => {
  it(
    "writes openable Word/Excel/PowerPoint/PDF + text samples with measured creationMs",
    async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const measuredAt = new Date().toISOString();
      const entries: ProofManifestEntry[] = [];

      async function timed<T extends { fileName: string; buffer: Buffer }>(
        run: () => Promise<T>,
      ): Promise<T & { creationMs: number }> {
        const started = Date.now();
        const file = await run();
        const creationMs = Math.max(1, Date.now() - started);
        return { ...file, creationMs };
      }

      function pushEntry(
        partial: Omit<ProofManifestEntry, "creationSec" | "measuredAt"> & {
          creationMs: number;
        },
      ) {
        entries.push({
          ...partial,
          creationSec: creationSecFromMs(partial.creationMs),
          measuredAt,
        });
      }

      const docx = await timed(() =>
        new DocxDeliverableGenerator().generate(
          PROOF_DOCX_BODY,
          "minervot-sample-weekly-report",
          {
            title: "週次業務レポート（見本）",
            assignment: "週次業務レポートを作成してください（見本）",
          },
        ),
      );
      expect((await verifyGeneratedExportAsync(docx)).ok).toBe(true);
      writeFileSync(join(OUT_DIR, "weekly-report.docx"), docx.buffer);
      pushEntry({
        id: "docx-weekly-report",
        kind: "docx",
        fileName: "weekly-report.docx",
        href: "/samples/weekly-report.docx",
        bytes: docx.buffer.byteLength,
        creationMs: docx.creationMs,
        generator: "DocxDeliverableGenerator",
      });

      const xlsx = await timed(() =>
        new XlsxDeliverableGenerator().generate(
          PROOF_XLSX_BODY,
          "minervot-sample-cost-table",
        ),
      );
      expect((await verifyGeneratedExportAsync(xlsx)).ok).toBe(true);
      writeFileSync(join(OUT_DIR, "cost-table.xlsx"), xlsx.buffer);
      pushEntry({
        id: "xlsx-cost-table",
        kind: "xlsx",
        fileName: "cost-table.xlsx",
        href: "/samples/cost-table.xlsx",
        bytes: xlsx.buffer.byteLength,
        creationMs: xlsx.creationMs,
        generator: "XlsxDeliverableGenerator",
      });

      const pptx = await timed(() =>
        new PptxDeliverableGenerator().generate(
          PROOF_PPTX_BODY,
          "minervot-sample-sales-deck",
          {
            title: "営業提案スライド（見本）",
            assignment: "営業資料をPowerPointで作ってください（見本）",
          },
        ),
      );
      expect((await verifyGeneratedExportAsync(pptx)).ok).toBe(true);
      // OOXML packages are ZIP files (PK header).
      expect(pptx.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
      writeFileSync(join(OUT_DIR, "sales-deck.pptx"), pptx.buffer);
      pushEntry({
        id: "pptx-sales-deck",
        kind: "pptx",
        fileName: "sales-deck.pptx",
        href: "/samples/sales-deck.pptx",
        bytes: pptx.buffer.byteLength,
        creationMs: pptx.creationMs,
        generator: "PptxDeliverableGenerator",
      });

      const pdf = await timed(() =>
        new PdfDeliverableGenerator().generate(
          PROOF_PDF_BODY,
          "minervot-sample-proposal-outline",
        ),
      );
      expect(pdf.buffer.byteLength).toBeGreaterThan(500);
      expect(pdf.buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
      writeFileSync(join(OUT_DIR, "proposal-outline.pdf"), pdf.buffer);
      pushEntry({
        id: "pdf-proposal-outline",
        kind: "pdf",
        fileName: "proposal-outline.pdf",
        href: "/samples/proposal-outline.pdf",
        bytes: pdf.buffer.byteLength,
        creationMs: pdf.creationMs,
        generator: "PdfDeliverableGenerator",
      });

      // SNS/email: measure producing a real deliverable file of the completed sample.
      // Text downloads remain available; timing comes from PDF generation (same engine).
      const snsText = await new PlainTextDeliverableGenerator().generate(
        PROOF_SNS_SAMPLE.after,
        "minervot-sample-sns-post",
      );
      writeFileSync(join(OUT_DIR, "sns-post.txt"), snsText.buffer);
      const sns = await timed(() =>
        new PdfDeliverableGenerator().generate(
          `# SNS投稿（見本）\n\n${PROOF_SNS_SAMPLE.after}`,
          "minervot-sample-sns-post",
        ),
      );
      writeFileSync(join(OUT_DIR, "sns-post.pdf"), sns.buffer);
      pushEntry({
        id: "sns-solar",
        kind: "sns",
        fileName: "sns-post.txt",
        href: "/samples/sns-post.txt",
        bytes: snsText.buffer.byteLength,
        creationMs: sns.creationMs,
        generator: "PdfDeliverableGenerator",
      });

      const emailText = await new PlainTextDeliverableGenerator().generate(
        PROOF_EMAIL_SAMPLE.after,
        "minervot-sample-email",
      );
      writeFileSync(join(OUT_DIR, "email-draft.txt"), emailText.buffer);
      const email = await timed(() =>
        new PdfDeliverableGenerator().generate(
          `# メール下書き（見本）\n\n${PROOF_EMAIL_SAMPLE.after}`,
          "minervot-sample-email",
        ),
      );
      writeFileSync(join(OUT_DIR, "email-draft.pdf"), email.buffer);
      pushEntry({
        id: "email-followup",
        kind: "email",
        fileName: "email-draft.txt",
        href: "/samples/email-draft.txt",
        bytes: emailText.buffer.byteLength,
        creationMs: email.creationMs,
        generator: "PdfDeliverableGenerator",
      });

      const manifest: ProofManifest = {
        label: "sample",
        disclaimer: PROOF_DISCLAIMER,
        measuredAt,
        entries,
      };
      writeFileSync(
        join(OUT_DIR, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );

      expect(entries).toHaveLength(6);
      for (const entry of entries) {
        expect(entry.creationMs).toBeGreaterThan(0);
        expect(entry.bytes ?? 0).toBeGreaterThan(20);
      }
    },
    60_000,
  );
});
