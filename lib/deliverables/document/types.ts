export const STRUCTURED_DOCUMENT_VERSION = "1.0.0"
export const CANONICAL_HTML_VERSION = "1.0.0"
export const RENDERER_VERSION = "1.0.0"

export type DocumentSection =
  | {
      type: "heading"
      level: 1 | 2 | 3
      text: string
    }
  | {
      type: "paragraph"
      text: string
    }
  | {
      type: "bulletList"
      items: string[]
    }
  | {
      type: "numberedList"
      items: string[]
    }
  | {
      type: "table"
      headers: string[]
      rows: string[][]
    }
  | {
      type: "quote"
      text: string
    }
  | {
      type: "pageBreak"
    }

export type StructuredDocumentMetadata = {
  artifactType: string
  language: string
  createdAt: string
  version: string
  sourceFormat: SourceFormat
}

export type SourceFormat =
  | "json"
  | "escaped_json"
  | "markdown"
  | "plain"
  | "structured"
  | "unknown"

export type StructuredDocument = {
  id: string
  title: string
  summary?: string
  sections: DocumentSection[]
  metadata: StructuredDocumentMetadata
}

export type NormalizeWarning = {
  code: string
  message: string
}

export type NormalizeResult = {
  document: StructuredDocument
  sourceFormat: SourceFormat
  warnings: NormalizeWarning[]
  normalizedSuccessfully: boolean
  plainText: string
}
