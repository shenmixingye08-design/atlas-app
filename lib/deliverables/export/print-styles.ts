/**
 * Print / export styles for Canonical HTML.
 * Explicit print colors — never inherit dark-mode or UI theme variables.
 */
export const PRINT_STYLES = `
@page {
  size: A4;
  margin: 18mm 16mm 18mm 16mm;
}
html, body {
  background: #ffffff !important;
  color: #111111 !important;
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
  font-size: 11pt;
  line-height: 1.7;
  margin: 0;
  padding: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.canonical-document {
  max-width: 100%;
  color: #111111 !important;
  background: #ffffff !important;
}
.doc-header h1 {
  font-size: 20pt;
  font-weight: 700;
  color: #111111 !important;
  margin: 0 0 12pt;
  page-break-after: avoid;
}
.doc-summary h2,
.doc-body h1,
.doc-body h2,
.doc-body h3 {
  color: #111111 !important;
  page-break-after: avoid;
  break-after: avoid;
  margin: 14pt 0 6pt;
}
.doc-body h1 { font-size: 16pt; }
.doc-body h2 { font-size: 14pt; }
.doc-body h3 { font-size: 12pt; }
p, li, td, th, blockquote {
  color: #111111 !important;
  orphans: 3;
  widows: 3;
}
p { margin: 0 0 8pt; }
ul, ol { margin: 0 0 10pt 1.2em; padding: 0; }
li { margin: 0 0 4pt; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 12pt;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #333333;
  padding: 6pt 8pt;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f3f3f3 !important;
  font-weight: 700;
}
blockquote {
  margin: 0 0 10pt;
  padding: 6pt 10pt;
  border-left: 3px solid #444444;
  color: #222222 !important;
}
.page-break {
  page-break-before: always;
  break-before: page;
  height: 0;
}
/* Exclude UI / dark theme leakage */
button, nav, [data-ui], .no-print, svg.decoration {
  display: none !important;
}
* {
  animation: none !important;
  transition: none !important;
  box-shadow: none !important;
  text-shadow: none !important;
  opacity: 1 !important;
}
`
