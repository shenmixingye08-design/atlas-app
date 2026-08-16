/**
 * Classify how an X automation should obtain post text.
 *
 * A. fixed — use the stored / quoted body as-is (no AI)
 * B. generate — user delegated copywriting to MINERVOT
 * C. missing — truly no body and no generation intent
 *
 * Does not call AI. Safe for wizard NL propose and execution.
 */

export type XPostContentMode = "fixed" | "generate" | "missing";

export type XPostContentClassification = {
  mode: XPostContentMode;
  text: string;
  topic: string;
  generateInstruction: string;
  reason: string;
};

const GENERATE_PATTERN =
  /考え(て|る)|文章を作|内容を作|文案|任せる|おまかせ|お任せ|生成|作って投稿|考えて投稿|投稿内容を|文章も|自分で文章を作って|内容は任/;

const DEICTIC_ONLY_PATTERN =
  /^(これを|それを|あの内容を|この内容を|この投稿を|その投稿を)/;

const QUOTED_BODY_PATTERN =
  /[『「]([^『「』」]{1,280})[』」]\s*(と|を)/;

const AS_IS_PATTERN = /(.+?)をそのまま/;

const TOPIC_PATTERN = /([^\s、。]{1,40}?)について/;

const FILLER_NOTE_PATTERN =
  /^(特になし|とくになし|特に無い|特にない|特に無し|なし|無い|ない|特に指定なし|指定なし|任せる|おまかせ|お任せ|とくに指定なし|n\/a|none|-|ー|—)$/i;

export function isFillerXPostNote(value: string | null | undefined): boolean {
  return FILLER_NOTE_PATTERN.test((value ?? "").trim());
}

export function readStoredXPostText(
  configuration: Readonly<Record<string, unknown>> | null | undefined,
): string {
  if (!configuration) return "";
  for (const key of ["text", "body", "content", "message"] as const) {
    const value = configuration[key];
    if (typeof value === "string" && value.trim()) {
      const text = value.trim();
      if (isFillerXPostNote(text)) continue;
      return text;
    }
  }
  return "";
}

export type ResumeXPostInputKind = "empty" | "constraint" | "explicit_fixed";

export function interpretResumeXPostInput(
  inputPatch?: Record<string, unknown> | null,
): { kind: ResumeXPostInputKind; value: string } {
  if (!inputPatch) return { kind: "empty", value: "" };
  const rawCandidates = [inputPatch.note, inputPatch.text, inputPatch.body];
  const raw = rawCandidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || isFillerXPostNote(value)) {
    return { kind: "empty", value: "" };
  }
  const quoted = extractQuotedOrAsIsPostText(value);
  if (quoted) {
    return { kind: "explicit_fixed", value: quoted };
  }
  if (/この文章をそのまま|投稿本文は/.test(value)) {
    const stripped = value
      .replace(/^投稿本文は/, "")
      .replace(/この文章をそのまま(投稿して)?/, "")
      .trim();
    if (stripped && !isFillerXPostNote(stripped)) {
      return { kind: "explicit_fixed", value: stripped };
    }
  }
  return { kind: "constraint", value };
}

export function readXPostContentSource(
  configuration: Readonly<Record<string, unknown>> | null | undefined,
): "fixed" | "generate" | "unresolved" | "" {
  const raw = configuration?.contentSource;
  if (raw === "fixed" || raw === "generate" || raw === "unresolved") return raw;
  return "";
}

export function extractQuotedOrAsIsPostText(source: string): string | null {
  const quoted = source.match(QUOTED_BODY_PATTERN);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const asIs = source.match(AS_IS_PATTERN);
  if (!asIs?.[1]) return null;
  const candidate = asIs[1]
    .trim()
    .replace(/^(毎日|毎朝|毎回|毎週)/, "")
    .replace(/[。．.]+$/, "")
    .trim();
  if (!candidate || candidate.length > 280) return null;
  if (GENERATE_PATTERN.test(candidate)) return null;
  if (/投稿|ツイート|Xに|Xへ/.test(candidate) && candidate.length < 8) {
    return null;
  }
  return candidate;
}

export function extractXPostTopic(source: string): string {
  const match = source.match(TOPIC_PATTERN);
  return (match?.[1] ?? "")
    .replace(/^(毎日|毎朝|毎回|毎週|毎月)/, "")
    .trim();
}

export function collectXPostInstructionText(input: {
  configuration?: Readonly<Record<string, unknown>> | null;
  freeformNotes?: string | null;
  automationName?: string | null;
  resolvedNotes?: string | null;
  resumeNotes?: string | null;
}): string {
  const storedInstruction =
    typeof input.configuration?.generateInstruction === "string"
      ? input.configuration.generateInstruction.trim()
      : "";
  const resume = input.resumeNotes?.trim() ?? "";
  return [
    storedInstruction,
    input.freeformNotes?.trim() ?? "",
    input.resolvedNotes?.trim() ?? "",
    resume && !isFillerXPostNote(resume) ? `追加条件: ${resume}` : "",
    input.automationName?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function classifyXPostContent(input: {
  configuration?: Readonly<Record<string, unknown>> | null;
  freeformNotes?: string | null;
  automationName?: string | null;
  resolvedNotes?: string | null;
  resumeNotes?: string | null;
}): XPostContentClassification {
  const configuration = input.configuration ?? {};
  const source = readXPostContentSource(configuration);
  const storedText = readStoredXPostText(configuration);
  const instruction = collectXPostInstructionText(input);
  const quoted = extractQuotedOrAsIsPostText(instruction);
  const topic =
    (typeof configuration.topic === "string" && configuration.topic.trim()) ||
    extractXPostTopic(instruction);

  if (source === "generate") {
    return {
      mode: "generate",
      text: "",
      topic,
      generateInstruction: instruction,
      reason: "content_source_generate",
    };
  }

  if (source === "fixed" && quoted) {
    return {
      mode: "fixed",
      text: quoted,
      topic,
      generateInstruction: instruction,
      reason: "content_source_fixed_quoted",
    };
  }

  if (source === "fixed" && storedText) {
    return {
      mode: "fixed",
      text: storedText,
      topic,
      generateInstruction: instruction,
      reason: "content_source_fixed",
    };
  }

  if (quoted) {
    return {
      mode: "fixed",
      text: quoted,
      topic,
      generateInstruction: instruction,
      reason: "quoted_or_as_is",
    };
  }

  if (storedText && !GENERATE_PATTERN.test(instruction)) {
    return {
      mode: "fixed",
      text: storedText,
      topic,
      generateInstruction: instruction,
      reason: "stored_fixed_text",
    };
  }

  const deictic = DEICTIC_ONLY_PATTERN.test(instruction.trim());
  if (deictic && !GENERATE_PATTERN.test(instruction) && !topic) {
    return {
      mode: "missing",
      text: "",
      topic: "",
      generateInstruction: instruction,
      reason: "deictic_unresolved",
    };
  }

  if (GENERATE_PATTERN.test(instruction) || (topic && /投稿|ツイート/.test(instruction))) {
    return {
      mode: "generate",
      text: "",
      topic,
      generateInstruction: instruction,
      reason: GENERATE_PATTERN.test(instruction)
        ? "generate_verb"
        : "topic_post",
    };
  }

  if (storedText) {
    return {
      mode: "fixed",
      text: storedText,
      topic,
      generateInstruction: instruction,
      reason: "stored_text_fallback",
    };
  }

  return {
    mode: "missing",
    text: "",
    topic,
    generateInstruction: instruction,
    reason: "no_body_or_intent",
  };
}

export function buildXPostStepConfiguration(input: {
  sourceText: string;
}): Record<string, unknown> {
  const classified = classifyXPostContent({
    configuration: {},
    freeformNotes: input.sourceText,
  });
  if (classified.mode === "fixed") {
    return {
      contentSource: "fixed",
      text: classified.text,
    };
  }
  if (classified.mode === "generate") {
    return {
      contentSource: "generate",
      generateInstruction: input.sourceText.trim(),
      ...(classified.topic ? { topic: classified.topic } : {}),
    };
  }
  return { contentSource: "unresolved" };
}

export const X_POST_MISSING_CONTENT_MESSAGE = "投稿する内容が確認できません";
export const X_POST_GENERATION_FAILED_MESSAGE =
  "投稿本文の自動作成に失敗しました。再試行できます。";
export const X_POST_GENERATION_FAILED_CODE = "x_post_generation_failed";
