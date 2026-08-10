/**
 * Inject real Excel chart OOXML into an exceljs-written .xlsx buffer (P3-03).
 * exceljs cannot create charts — we post-process the ZIP package.
 */

import JSZip from "jszip";

import { PIVOT_SHEET_NAME } from "./pivot";

export type ChartInjectResult = {
  buffer: Buffer;
  chartInjected: boolean;
  drawingInjected: boolean;
  pivotSheetFound: boolean;
  sheetPath: string | null;
  error: string | null;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildChartXml(input: {
  sheetName: string;
  lastRow: number;
  title: string;
  seriesHeaderCell: string;
}): string {
  const sn = escapeXml(input.sheetName);
  const catRange = `$A$2:$A$${input.lastRow}`;
  const valRange = `$B$2:$B$${input.lastRow}`;
  const seriesCell = escapeXml(input.seriesHeaderCell);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="ja-JP"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr><a:defRPr sz="1200"/></a:pPr>
            <a:r><a:rPr lang="ja-JP" sz="1200"/><a:t>${escapeXml(input.title)}</a:t></a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx>
            <c:strRef>
              <c:f>'${sn}'!${seriesCell}</c:f>
            </c:strRef>
          </c:tx>
          <c:cat>
            <c:strRef>
              <c:f>'${sn}'!${catRange}</c:f>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:f>'${sn}'!${valRange}</c:f>
            </c:numRef>
          </c:val>
        </c:ser>
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:crossAx val="2"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:crossAx val="1"/>
      </c:valAx>
    </c:plotArea>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function buildDrawingXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="ATLAS Chart 1"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

function resolveSheetPathByName(
  workbookXml: string,
  workbookRelsXml: string,
  sheetName: string,
): string | null {
  const sheetRe =
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>|<sheet[^>]*r:id="([^"]+)"[^>]*name="([^"]+)"[^>]*\/?>/g;
  let match: RegExpExecArray | null;
  let rId: string | null = null;
  while ((match = sheetRe.exec(workbookXml))) {
    const name = match[1] ?? match[4];
    const id = match[2] ?? match[3];
    if (name === sheetName && id) {
      rId = id;
      break;
    }
  }
  if (!rId) return null;
  const relRe = new RegExp(
    `<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"[^>]*\\/?>|<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rId}"[^>]*\\/?>`,
  );
  const rel = relRe.exec(workbookRelsXml);
  const target = rel?.[1] ?? rel?.[2];
  if (!target) return null;
  const cleaned = target.replace(/^\//, "");
  return cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned}`;
}

/**
 * Attach a clustered column chart to the pivot sheet inside an xlsx buffer.
 */
export async function injectPivotChartIntoXlsx(
  inputBuffer: Buffer,
  options?: {
    sheetName?: string;
    title?: string;
    lastDataRow?: number;
  },
): Promise<ChartInjectResult> {
  const sheetName = options?.sheetName ?? PIVOT_SHEET_NAME;
  try {
    const zip = await JSZip.loadAsync(inputBuffer);
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    const workbookRelsXml = await zip
      .file("xl/_rels/workbook.xml.rels")
      ?.async("string");
    if (!workbookXml || !workbookRelsXml) {
      return {
        buffer: inputBuffer,
        chartInjected: false,
        drawingInjected: false,
        pivotSheetFound: false,
        sheetPath: null,
        error: "workbook_xml_missing",
      };
    }

    const sheetPath = resolveSheetPathByName(
      workbookXml,
      workbookRelsXml,
      sheetName,
    );
    if (!sheetPath) {
      return {
        buffer: inputBuffer,
        chartInjected: false,
        drawingInjected: false,
        pivotSheetFound: false,
        sheetPath: null,
        error: "pivot_sheet_not_found",
      };
    }

    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) {
      return {
        buffer: inputBuffer,
        chartInjected: false,
        drawingInjected: false,
        pivotSheetFound: false,
        sheetPath,
        error: "sheet_part_missing",
      };
    }

    let sheetXml = await sheetFile.async("string");
    // Derive last data row from sheet dimension when not provided.
    let lastRow = options?.lastDataRow;
    if (lastRow == null) {
      const dim = sheetXml.match(/ref="[A-Z]+1:([A-Z]+)(\d+)"/);
      lastRow = dim ? Number(dim[2]) : 2;
    }
    if (!Number.isFinite(lastRow) || lastRow < 2) {
      return {
        buffer: inputBuffer,
        chartInjected: false,
        drawingInjected: false,
        pivotSheetFound: true,
        sheetPath,
        error: "insufficient_pivot_rows",
      };
    }

    // Idempotent: strip prior ATLAS drawing hook before re-injecting.
    sheetXml = sheetXml.replace(/<drawing[^>]*\/>/g, "");
    if (!sheetXml.includes("</worksheet>")) {
      return {
        buffer: inputBuffer,
        chartInjected: false,
        drawingInjected: false,
        pivotSheetFound: true,
        sheetPath,
        error: "sheet_xml_malformed",
      };
    }
    sheetXml = sheetXml.replace(
      "</worksheet>",
      '<drawing r:id="rIdAtlasChart"/></worksheet>',
    );
    zip.file(sheetPath, sheetXml);

    const sheetBase = sheetPath.split("/").pop() ?? "sheet1.xml";
    const sheetRelsPath = `xl/worksheets/_rels/${sheetBase}.rels`;
    zip.file(
      sheetRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdAtlasChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
    );

    zip.file("xl/drawings/drawing1.xml", buildDrawingXml());
    zip.file(
      "xl/drawings/_rels/drawing1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>`,
    );
    zip.file(
      "xl/charts/chart1.xml",
      buildChartXml({
        sheetName,
        lastRow,
        title: options?.title ?? "カテゴリ別合計",
        seriesHeaderCell: "$B$1",
      }),
    );

    const ctFile = zip.file("[Content_Types].xml");
    if (!ctFile) {
      return {
        buffer: inputBuffer,
        chartInjected: false,
        drawingInjected: false,
        pivotSheetFound: true,
        sheetPath,
        error: "content_types_missing",
      };
    }
    let contentTypes = await ctFile.async("string");
    // Remove prior overrides then add (idempotent).
    contentTypes = contentTypes
      .replace(
        /<Override[^>]*PartName="\/xl\/drawings\/drawing1\.xml"[^>]*\/>/g,
        "",
      )
      .replace(
        /<Override[^>]*PartName="\/xl\/charts\/chart1\.xml"[^>]*\/>/g,
        "",
      );
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    );
    zip.file("[Content_Types].xml", contentTypes);

    const out = Buffer.from(
      await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      }),
    );
    return {
      buffer: out,
      chartInjected: true,
      drawingInjected: true,
      pivotSheetFound: true,
      sheetPath,
      error: null,
    };
  } catch (error) {
    return {
      buffer: inputBuffer,
      chartInjected: false,
      drawingInjected: false,
      pivotSheetFound: false,
      sheetPath: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Inspect whether an xlsx buffer contains chart + drawing parts. */
export async function inspectXlsxAdvancedParts(buffer: Buffer): Promise<{
  hasChart: boolean;
  hasDrawing: boolean;
  hasPivotSheet: boolean;
  chartPaths: string[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p]?.dir);
  const chartPaths = paths.filter((p) => /^xl\/charts\/chart\d+\.xml$/i.test(p));
  const hasDrawing = paths.some((p) =>
    /^xl\/drawings\/drawing\d+\.xml$/i.test(p),
  );
  let hasPivotSheet = false;
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (workbookXml && workbookXml.includes(`name="${PIVOT_SHEET_NAME}"`)) {
    hasPivotSheet = true;
  }
  return {
    hasChart: chartPaths.length > 0,
    hasDrawing,
    hasPivotSheet,
    chartPaths,
  };
}
