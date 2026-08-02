/**
 * Client-side proof that an activation artifact is a real, downloadable Word file.
 * Uses the same /api/deliverables/:id route (auth + ownership + integrity).
 */

export type ArtifactVerification = {
  ok: true;
  artifactId: string;
  downloadUrl: string;
  sizeBytes: number;
  hasPkHeader: boolean;
  contentType: string | null;
};

export type ArtifactVerificationFailure = {
  ok: false;
  stage: "storage" | "deliverable" | "ownership";
  message: string;
  artifactId: string | null;
};

const DELIVERABLE_ID_RE = /\/api\/deliverables\/([^/?#]+)/i;

export function extractDeliverableIdFromUrl(url: string): string | null {
  const match = url.match(DELIVERABLE_ID_RE);
  const id = match?.[1]?.trim();
  return id && id.length > 0 ? id : null;
}

function hasPkHeader(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 2) return false;
  const view = new Uint8Array(bytes);
  return view[0] === 0x50 && view[1] === 0x4b;
}

/**
 * Fetch the download URL with session cookies and require OOXML PK + size > 0.
 * 401/403 ⇒ ownership/auth failure; 404 ⇒ storage missing.
 */
export async function verifyActivationArtifact(downloadUrl: string): Promise<
  ArtifactVerification | ArtifactVerificationFailure
> {
  const artifactId = extractDeliverableIdFromUrl(downloadUrl);
  if (!artifactId) {
    return {
      ok: false,
      stage: "storage",
      message: "成果物の保存先URLを確認できませんでした。再実行してください。",
      artifactId: null,
    };
  }

  // Prefer relative API path so cookies stay same-origin.
  const path = `/api/deliverables/${encodeURIComponent(artifactId)}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*" },
    });
  } catch {
    return {
      ok: false,
      stage: "storage",
      message: "成果物のダウンロード確認に失敗しました。通信状況をご確認ください。",
      artifactId,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      stage: "ownership",
      message:
        "成果物の所有権を確認できませんでした。ログイン状態をご確認のうえ、再実行してください。",
      artifactId,
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      stage: "storage",
      message: "成果物がStorageに見つかりませんでした。再実行してください。",
      artifactId,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      stage: "deliverable",
      message: "成果物ファイルの検証に失敗しました。再実行してください。",
      artifactId,
    };
  }

  const buffer = await response.arrayBuffer();
  const sizeBytes = buffer.byteLength;
  if (sizeBytes <= 0) {
    return {
      ok: false,
      stage: "deliverable",
      message: "成果物ファイルが空でした。再実行してください。",
      artifactId,
    };
  }

  const pk = hasPkHeader(buffer);
  if (!pk) {
    return {
      ok: false,
      stage: "deliverable",
      message:
        "Word形式（DOCX）として検証できませんでした。再実行してください。",
      artifactId,
    };
  }

  return {
    ok: true,
    artifactId,
    downloadUrl: path,
    sizeBytes,
    hasPkHeader: true,
    contentType: response.headers.get("content-type"),
  };
}
