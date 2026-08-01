import JSZip from "jszip";

import { colLetter } from "./cell-types";

export type ChartKind = "bar" | "line" | "pie" | "stacked" | "combo";

export type ChartSpec = {
  kind: ChartKind;
  title: string;
  /** 0-based worksheet index in workbook (ExcelJS order) */
  sheetIndex: number;
  /** header row is 1; categories in this column */
  categoryCol: number;
  /** values in this column */
  valueCol: number;
  /** first data row (usually 2) */
  startRow: number;
  endRow: number;
  /** optional secondary value column for combo */
  valueCol2?: number;
};

function chartSeriesXml(input: {
  kind: ChartKind;
  sheetName: string;
  categoryCol: number;
  valueCol: number;
  startRow: number;
  endRow: number;
  seriesTitle: string;
  seriesIndex: number;
}): string {
  const cat = colLetter(input.categoryCol);
  const val = colLetter(input.valueCol);
  const sheet = input.sheetName.replace(/'/g, "''");
  const catRef = `'${sheet}'!$${cat}$${input.startRow}:$${cat}$${input.endRow}`;
  const valRef = `'${sheet}'!$${val}$${input.startRow}:$${val}$${input.endRow}`;
  const titleRef = `'${sheet}'!$${val}$1`;

  const catCache = `<c:cat><c:strRef><c:f>${catRef}</c:f></c:strRef></c:cat>`;
  const valCache = `<c:val><c:numRef><c:f>${valRef}</c:f></c:numRef></c:val>`;
  const tx = `<c:tx><c:strRef><c:f>${titleRef}</c:f></c:strRef></c:tx>`;

  if (input.kind === "pie") {
    return `<c:ser><c:idx val="${input.seriesIndex}"/><c:order val="${input.seriesIndex}"/>${tx}${catCache}${valCache}</c:ser>`;
  }
  if (input.kind === "line") {
    return `<c:ser><c:idx val="${input.seriesIndex}"/><c:order val="${input.seriesIndex}"/>${tx}${catCache}${valCache}</c:ser>`;
  }
  // bar / stacked / combo bar series
  return `<c:ser><c:idx val="${input.seriesIndex}"/><c:order val="${input.seriesIndex}"/>${tx}${catCache}${valCache}</c:ser>`;
}

function buildChartXml(spec: ChartSpec, sheetName: string): string {
  const ser0 = chartSeriesXml({
    kind: spec.kind === "combo" ? "bar" : spec.kind,
    sheetName,
    categoryCol: spec.categoryCol,
    valueCol: spec.valueCol,
    startRow: spec.startRow,
    endRow: spec.endRow,
    seriesTitle: "系列1",
    seriesIndex: 0,
  });

  if (spec.kind === "pie") {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="1"/>
        ${ser0}
        <c:dLbls><c:showPercent val="1"/><c:showVal val="0"/><c:showCatName val="1"/></c:dLbls>
      </c:pieChart>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
  </c:chart>
</c:chartSpace>`;
  }

  if (spec.kind === "line") {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        ${ser0}
        <c:axId val="1"/><c:axId val="2"/>
      </c:lineChart>
      <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
  </c:chart>
</c:chartSpace>`;
  }

  if (spec.kind === "combo" && spec.valueCol2 != null) {
    const ser1 = chartSeriesXml({
      kind: "line",
      sheetName,
      categoryCol: spec.categoryCol,
      valueCol: spec.valueCol2,
      startRow: spec.startRow,
      endRow: spec.endRow,
      seriesTitle: "系列2",
      seriesIndex: 1,
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/><c:grouping val="clustered"/>
        ${ser0}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:lineChart>
        <c:grouping val="standard"/>
        ${ser1}
        <c:axId val="1"/><c:axId val="2"/>
      </c:lineChart>
      <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
  </c:chart>
</c:chartSpace>`;
  }

  const grouping = spec.kind === "stacked" ? "stacked" : "clustered";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="${grouping}"/>
        ${ser0}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
  </c:chart>
</c:chartSpace>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function drawingXml(chartRelId: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Chart 1"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="${chartRelId}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

/**
 * Inject DrawingML chart parts into an ExcelJS-produced xlsx buffer.
 */
export async function injectChartsIntoXlsx(
  buffer: Buffer,
  specs: ChartSpec[],
  sheetNames: string[],
): Promise<Buffer> {
  if (specs.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  let contentTypes =
    (await zip.file("[Content_Types].xml")?.async("string")) ?? "";

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]!;
    const sheetName = sheetNames[spec.sheetIndex] ?? sheetNames[0] ?? "データ";
    const chartId = i + 1;
    const drawingId = i + 1;
    const sheetPath = `xl/worksheets/sheet${spec.sheetIndex + 1}.xml`;
    const chartPath = `xl/charts/chart${chartId}.xml`;
    const drawingPath = `xl/drawings/drawing${drawingId}.xml`;
    const drawingRelsPath = `xl/drawings/_rels/drawing${drawingId}.xml.rels`;
    const sheetRelsPath = `xl/worksheets/_rels/sheet${spec.sheetIndex + 1}.xml.rels`;

    zip.file(chartPath, buildChartXml(spec, sheetName));
    zip.file(drawingPath, drawingXml("rId1"));
    zip.file(
      drawingRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartId}.xml"/>
</Relationships>`,
    );

    let sheetRels = (await zip.file(sheetRelsPath)?.async("string")) ?? "";
    if (!sheetRels) {
      sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
    }
    const drawingRelId = `rIdChart${drawingId}`;
    if (!sheetRels.includes(drawingPath.split("/").pop() ?? "drawing")) {
      sheetRels = sheetRels.replace(
        "</Relationships>",
        `  <Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingId}.xml"/>
</Relationships>`,
      );
    }
    zip.file(sheetRelsPath, sheetRels);

    let sheetXml = (await zip.file(sheetPath)?.async("string")) ?? "";
    if (sheetXml && !sheetXml.includes("drawing")) {
      sheetXml = sheetXml.replace(
        "</worksheet>",
        `<drawing r:id="${drawingRelId}"/></worksheet>`,
      );
      if (!sheetXml.includes('xmlns:r=')) {
        sheetXml = sheetXml.replace(
          "<worksheet ",
          '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
        );
      }
      zip.file(sheetPath, sheetXml);
    }

    if (!contentTypes.includes(chartPath)) {
      contentTypes = contentTypes.replace(
        "</Types>",
        `  <Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
  <Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`,
      );
    }
  }

  zip.file("[Content_Types].xml", contentTypes);
  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  return Buffer.from(out);
}
