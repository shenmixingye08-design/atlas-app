import {
  buildSourceInputs,
  hasFileSource,
  hasImageSource,
  isDeicticRequest,
  primaryFileSource,
} from "./attachments";
import { computeMissingFields } from "./fields";
import { validateParsedRequest } from "./schema";
import {
  detectActionSignals,
  detectDocumentKind,
  detectExplicitFormats,
  impliedFormatsForKind,
  normalizeTypos,
  preferredFormatToOutput,
} from "./signals";
import type {
  AttachmentMeta,
  ConfidenceBreakdown,
  DocumentKind,
  ExecutionMode,
  OutputFormat,
  ParsedRequest,
  RequestIntent,
  RequestedOutput,
  RouterTarget,
  TaskCategory,
  UnderstandInput,
} from "./types";
import { buildWorkflow, summarizeForUser } from "./workflow";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function intentFromMode(
  mode: ExecutionMode,
  primary: OutputFormat | null,
  actions: ReturnType<typeof detectActionSignals>,
  kind: DocumentKind,
): RequestIntent {
  if (actions.wantsEdit) return "edit_artifact";
  if (mode === "automation") return "schedule_automation";
  if (mode === "external_action") return "external_execute";
  if (mode === "conversion") return "convert_file";
  if (mode === "analysis") {
    return actions.convertSourceHint === "image" || kind === "household"
      ? "analyze_image"
      : "analyze_file";
  }
  if (mode === "answer") {
    if (kind === "sns_draft" || kind === "email_draft") return "conversation";
    return "conversation";
  }
  if (mode === "mixed") return "composite";
  switch (primary) {
    case "docx":
      return "create_word";
    case "xlsx":
      return "create_excel";
    case "pdf":
      return "create_pdf";
    case "pptx":
      return "create_pptx";
    case "csv":
      return "create_csv";
    case "image":
      return "create_image";
    default:
      return "conversation";
  }
}

function categoryFrom(kind: DocumentKind, format: OutputFormat | null): TaskCategory {
  if (kind === "household" || format === "xlsx" || format === "csv") return "spreadsheet";
  if (kind === "sales_deck" || format === "pptx") return "presentation";
  if (kind === "email_draft" || kind === "sns_draft") return "communication";
  if (format === "pdf" || format === "docx" || kind) return "document";
  return "unknown";
}

function mergeOutputs(
  explicit: ReturnType<typeof detectExplicitFormats>,
  implied: ReturnType<typeof impliedFormatsForKind>,
  preferred: OutputFormat | null,
  mode: ExecutionMode,
): RequestedOutput[] {
  const map = new Map<OutputFormat, RequestedOutput>();

  const add = (format: OutputFormat, purpose: string, confidence: number, required: boolean) => {
    const prev = map.get(format);
    if (!prev || prev.confidence < confidence) {
      map.set(format, { format, purpose, confidence, required });
    } else if (prev && required && !prev.required) {
      map.set(format, { ...prev, required: true });
    }
  };

  if (preferred) {
    add(preferred, "ユーザー指定形式", 0.99, true);
  }

  for (const s of explicit) {
    add(s.format, s.reason, s.weight, true);
  }

  // Implied only when not converting-only and not answer-only
  if (mode === "artifact" || mode === "mixed" || mode === "automation") {
    const hasExplicit = explicit.length > 0 || preferred != null;
    for (const s of implied) {
      if (
        hasExplicit &&
        s.format !== preferred &&
        !explicit.some((e) => e.format === s.format)
      ) {
        // Keep useful companions: PDF提出用, 編集用xlsx/docx/pptx, CSV
        add(s.format, s.purpose, Math.min(0.8, s.weight), false);
        continue;
      }
      add(
        s.format,
        s.purpose,
        hasExplicit ? Math.min(0.85, s.weight) : s.weight,
        true,
      );
    }
  }

  if (mode === "conversion" && explicit[0]) {
    return [
      {
        format: explicit[0].format,
        purpose: "変換出力",
        required: true,
        confidence: explicit[0].weight,
      },
    ];
  }

  if (mode === "answer" || mode === "analysis") {
    if (map.size === 0) {
      add("markdown", mode === "analysis" ? "解析結果" : "回答", 0.8, true);
    }
  }

  if (map.size === 0) {
    add("markdown", "テキスト整理", 0.45, true);
  }

  // Cap to avoid cost explosion — max 3 formats
  return [...map.values()]
    .sort((a, b) => Number(b.required) - Number(a.required) || b.confidence - a.confidence)
    .slice(0, 3);
}

function buildClarificationQuestions(input: {
  missing: string[];
  kind: DocumentKind;
  ambiguousFormats: boolean;
  ambiguousAttachment: boolean;
  lowConfidence: boolean;
  neverAssume: string[];
}): string[] {
  const questions: string[] = [];

  if (input.ambiguousAttachment) {
    questions.push(
      "複数の添付があります。どれを使いますか？使わないファイルがあれば教えてください。",
    );
  }

  if (input.ambiguousFormats) {
    questions.push(
      "成果物の形式を確認させてください。Word / Excel / PDF / PowerPoint のどれがよいですか？複数も可能です。",
    );
  }

  if (input.missing.length > 0 || input.neverAssume.length > 0) {
    const labels: Record<string, string> = {
      line_items: "品目と数量・単価",
      amount: "金額",
      total: "合計金額",
      bank: "振込先",
      parties: "契約の当事者",
      terms: "主要契約条件",
      name: "氏名",
      period: "対象期間",
      offer: "商品・サービス内容",
      topic: "テーマ",
      entries: "収支の内容（またはレシート画像）",
    };
    const keys = [...new Set([...input.missing, ...input.neverAssume])].slice(0, 4);
    const joined = keys.map((k) => labels[k] ?? k).join("・");
    if (input.kind === "estimate" || input.kind === "invoice") {
      questions.push(
        `${input.kind === "estimate" ? "見積書" : "請求書"}の作成に必要な、${joined}を教えてください。デザインは標準のビジネス形式で作成できます。`,
      );
    } else if (input.kind === "contract") {
      questions.push(
        `契約書は重要情報の仮置きができないため、${joined}を教えてください。`,
      );
    } else {
      questions.push(`続きを進めるため、${joined}を教えてください。`);
    }
  }

  if (input.lowConfidence && questions.length === 0) {
    questions.push(
      "依頼の目的を確認させてください。作成・変換・解析・送信のどれに近いですか？",
    );
  }

  return questions.slice(0, 3);
}

function resolveRouterTarget(
  mode: ExecutionMode,
  intent: RequestIntent,
  needsClarify: boolean,
  wantsVision: boolean,
): RouterTarget {
  if (needsClarify) return "needs_input";
  if (intent === "unsupported") return "unsupported";
  if (mode === "automation") return "automation_register";
  if (mode === "external_action") return "external_execute";
  if (mode === "mixed") return "composite_workflow";
  if (mode === "conversion") return "artifact_convert";
  if (mode === "analysis") {
    return wantsVision ? "vision_analyze" : "file_analyze";
  }
  if (intent === "edit_artifact") return "artifact_edit";
  if (mode === "answer") return "conversation";
  if (wantsVision) return "composite_workflow";
  return "artifact_generate";
}

/**
 * Deterministic multi-signal request understanding.
 * Does not call LLMs — safe to run on every request before job creation.
 */
export function understandRequest(input: UnderstandInput): ParsedRequest {
  const diagnostic_id = newId("diag");
  const request_id = input.requestId?.trim() || newId("req");
  const raw = normalizeTypos(input.assignment ?? "");
  const assignment = raw.trim();
  const attachments: AttachmentMeta[] = input.attachments ?? [];

  if (!assignment && attachments.length === 0) {
    const empty: ParsedRequest = {
      request_id,
      intent: "needs_input",
      task_category: "unknown",
      document_kind: null,
      execution_mode: "answer",
      requested_outputs: [
        { format: "none", purpose: "確認待ち", required: true, confidence: 0.2 },
      ],
      source_inputs: [],
      detected_entities: {},
      required_fields: [],
      missing_required_fields: ["topic"],
      optional_fields: [],
      assumptions: [],
      risks: ["empty_request"],
      needs_clarification: true,
      clarification_questions: ["どのようなお仕事をお手伝いしましょうか？"],
      confidence: 0.2,
      confidence_breakdown: {
        intent: 0.2,
        executionMode: 0.2,
        outputFormat: 0.2,
        attachmentRole: 0,
        documentKind: 0,
        requiredFields: 0,
        conversionPath: 0,
        externalAction: 1,
      },
      recommended_workflow: [],
      user_summary: "依頼内容が空です",
      router_target: "needs_input",
      fallback_used: true,
      diagnostic_id,
    };
    return empty;
  }

  const actions = detectActionSignals(assignment);
  const kindSignal = detectDocumentKind(assignment);
  const kind: DocumentKind = kindSignal?.kind ?? null;
  const explicitFormats = detectExplicitFormats(assignment);
  const preferred = preferredFormatToOutput(input.preferredFormat);
  const sources = buildSourceInputs(assignment, attachments);
  const imageSource = hasImageSource(sources);
  const fileSource = hasFileSource(sources);
  const primaryFile = primaryFileSource(sources);
  const deictic = isDeicticRequest(assignment);

  // --- execution mode ---
  let execution_mode: ExecutionMode = "artifact";
  let fallback_used = false;

  if (actions.wantsAutomation && (actions.wantsCreate || actions.wantsExternalSend)) {
    execution_mode =
      actions.wantsExternalSend || explicitFormats.length || kind
        ? "mixed"
        : "automation";
  } else if (actions.wantsScheduleOnce && actions.wantsExternalSend) {
    execution_mode = "mixed";
  } else if (actions.wantsExternalSend && !actions.wantsDraftOnly) {
    execution_mode = actions.wantsCreate ? "mixed" : "external_action";
  } else if (actions.wantsConvert && (fileSource || actions.convertSourceHint || deictic)) {
    execution_mode = "conversion";
  } else if (actions.wantsAnalyze && !actions.wantsCreate) {
    execution_mode = "analysis";
  } else if (
    actions.wantsDraftOnly ||
    kind === "email_draft" ||
    kind === "sns_draft"
  ) {
    execution_mode =
      kind === "email_draft" ||
      kind === "sns_draft" ||
      /投稿文|メール文|文案|下書き/.test(assignment)
        ? "answer"
        : "artifact";
  } else if (
    /教えて|とは\？|ですか\？|どう思う|どうなって|何して|状況/.test(assignment) &&
    !/作って|作成|変換/.test(assignment)
  ) {
    execution_mode = "answer";
  } else if (actions.wantsEdit && (fileSource || /このPDF|このExcel|このWord|ページ/.test(assignment))) {
    execution_mode = "artifact";
  } else if (actions.wantsCreate || kind || explicitFormats.length || preferred) {
    execution_mode = "artifact";
  } else {
    execution_mode = "answer";
    fallback_used = true;
  }

  // Vague requests without document/format signals → clarify
  const vagueRequest =
    !kind &&
    explicitFormats.length === 0 &&
    !preferred &&
    !fileSource &&
    !imageSource &&
    !actions.wantsExternalSend &&
    !actions.wantsConvert &&
    !actions.wantsAnalyze &&
    assignment.length < 20 &&
    !/作って|作成|まとめて|生成|書いて/.test(assignment);

  // Receipt / image table shortcuts
  const wantsVision =
    imageSource ||
    /レシート|領収|名刺|この画像|写真から|スクショ/.test(assignment) ||
    (deictic && /excel|エクセル|家計簿|表/.test(assignment));

  if (wantsVision && /家計簿|excel|エクセル|表に/.test(assignment)) {
    execution_mode = execution_mode === "external_action" ? "mixed" : "mixed";
  }

  if (input.overrides?.execution_mode) {
    execution_mode = input.overrides.execution_mode;
  }
  if (input.overrides?.skip_external && execution_mode === "external_action") {
    execution_mode = "answer";
  }
  if (input.overrides?.skip_automation && execution_mode === "automation") {
    execution_mode = "artifact";
  }

  // Conversion target from actions
  if (execution_mode === "conversion" && actions.convertTarget) {
    explicitFormats.unshift({
      format: actions.convertTarget,
      weight: 0.95,
      reason: "変換先形式",
      explicit: true,
    });
  }

  let requested_outputs = mergeOutputs(
    explicitFormats,
    impliedFormatsForKind(kind),
    preferred,
    execution_mode,
  );

  // Image → excel household
  if (wantsVision && (kind === "household" || /家計簿|経費|表に/.test(assignment))) {
    const hasXlsx = requested_outputs.some((o) => o.format === "xlsx");
    if (!hasXlsx) {
      const merged: RequestedOutput[] = [
        { format: "xlsx", purpose: "家計簿・表", required: true, confidence: 0.92 },
        { format: "csv", purpose: "データ受け渡し", required: false, confidence: 0.7 },
        ...requested_outputs.filter((o) => o.format !== "csv"),
      ];
      requested_outputs = merged.slice(0, 3);
    }
    if (!kind) {
      // keep outputs
    }
  }

  if (input.overrides?.requested_outputs?.length) {
    requested_outputs = input.overrides.requested_outputs;
  }

  const primaryFormat =
    requested_outputs.find((o) => o.required)?.format ??
    requested_outputs[0]?.format ??
    null;

  const resolvedKind: DocumentKind =
    kind ??
    (primaryFormat === "xlsx"
      ? "generic"
      : primaryFormat === "pptx"
        ? "sales_deck"
        : /売上|一覧|集計|管理/.test(assignment)
          ? "generic"
          : null);

  const fieldInfo = computeMissingFields(assignment, resolvedKind);

  // Attachments required?
  const attachmentMissing =
    (deictic || actions.wantsConvert || wantsVision) &&
    !fileSource &&
    !imageSource &&
    /これ|添付|画像|写真|このExcel|このPDF|この表/.test(assignment);

  const ambiguousAttachment =
    attachments.length > 1 &&
    !/全部|すべて|全て|まとめて/.test(assignment) &&
    (actions.wantsConvert || deictic) &&
    attachments.length > 2;

  const formatConfidence = avg(requested_outputs.map((o) => o.confidence));
  const ambiguousFormats =
    !preferred &&
    explicitFormats.length === 0 &&
    formatConfidence < 0.55 &&
    execution_mode === "artifact";

  // never_assume amounts: do not block draft for estimate if line_items present;
  // only clarify when hard_required missing OR contract parties/terms.
  const neverAssumeBlocking = fieldInfo.required_fields
    .filter(
      (f) =>
        f.level === "never_assume" &&
        fieldInfo.missing_required_fields.includes(f.key) === false,
    )
    .filter((f) => {
      // For estimate/invoice, amount/bank missing → warn but allow draft with placeholders
      // unless hard_required missing
      return f.key === "parties" || f.key === "terms" || f.key === "name";
    })
    .map((f) => f.key);

  const hardMissing = fieldInfo.required_fields
    .filter((f) => f.level === "hard_required")
    .map((f) => f.key)
    .filter((k) => fieldInfo.missing_required_fields.includes(k));

  // Vision path can supply line_items / entries
  const effectiveHardMissing =
    wantsVision || imageSource
      ? hardMissing.filter((k) => k !== "line_items" && k !== "entries")
      : hardMissing;

  const confidence_breakdown: ConfidenceBreakdown = {
    intent: kindSignal?.weight ?? (explicitFormats.length ? 0.8 : 0.55),
    executionMode: actions.wantsExternalSend
      ? 0.9
      : actions.wantsConvert
        ? 0.88
        : actions.wantsAutomation
          ? 0.9
          : 0.75,
    outputFormat: preferred ? 0.99 : formatConfidence,
    attachmentRole: fileSource || imageSource ? 0.85 : deictic ? 0.35 : 0.7,
    documentKind: kindSignal?.weight ?? 0.45,
    requiredFields: effectiveHardMissing.length === 0 ? 0.85 : 0.4,
    conversionPath:
      execution_mode === "conversion"
        ? actions.convertTarget && (fileSource || actions.convertSourceHint)
          ? 0.9
          : 0.45
        : 0.8,
    externalAction: actions.wantsDraftOnly
      ? 0.95
      : actions.wantsExternalSend
        ? 0.9
        : 0.85,
  };

  let confidence = clamp01(
    avg([
      confidence_breakdown.intent,
      confidence_breakdown.executionMode,
      confidence_breakdown.outputFormat,
      confidence_breakdown.attachmentRole,
      confidence_breakdown.documentKind,
      confidence_breakdown.requiredFields,
    ]),
  );

  const intent = intentFromMode(execution_mode, primaryFormat, actions, resolvedKind);
  const task_category = wantsVision
    ? "vision"
    : categoryFrom(resolvedKind, primaryFormat);

  // Unsupported detection (honest)
  let unsupported_reason: string | undefined;
  let alternatives: string[] | undefined;
  if (/動画を生成|video\s*generat|3dモデル|音楽を作/.test(assignment)) {
    unsupported_reason =
      "動画・3D・音楽の生成にはまだ対応していません。";
    alternatives = [
      "企画書（Word/PDF）の作成",
      "構成案や台本の作成",
      "画像解析からの報告書作成",
    ];
    confidence = Math.min(confidence, 0.3);
  }

  const lowConfidence = confidence < 0.4;
  const midConfidence = confidence >= 0.4 && confidence < 0.7;

  let needs_clarification = false;
  if (unsupported_reason) {
    needs_clarification = false; // return unsupported, not endless clarify
  } else if (attachmentMissing) {
    needs_clarification = true;
  } else if (effectiveHardMissing.length > 0 && !fieldInfo.canDraft && !wantsVision) {
    needs_clarification = true;
  } else if (neverAssumeBlocking.length > 0) {
    needs_clarification = true;
  } else if (ambiguousAttachment) {
    needs_clarification = true;
  } else if (
    (lowConfidence || vagueRequest) &&
    execution_mode !== "external_action" &&
    execution_mode !== "automation"
  ) {
    needs_clarification = true;
    fallback_used = fallback_used || vagueRequest;
  } else if (
    midConfidence &&
    execution_mode === "artifact" &&
    (ambiguousFormats || (!kind && !explicitFormats.length))
  ) {
    needs_clarification = true;
  } else if (
    execution_mode === "conversion" &&
    !fileSource &&
    !actions.convertSourceHint &&
    !deictic
  ) {
    needs_clarification = true;
  }

  // High confidence → execute with assumptions (0.70+)
  // External actions still need confirmation at router/commander layer
  if (confidence >= 0.9 && !attachmentMissing && effectiveHardMissing.length === 0) {
    needs_clarification = false;
  }

  const clarification_questions = needs_clarification
    ? buildClarificationQuestions({
        missing: effectiveHardMissing,
        kind: resolvedKind,
        ambiguousFormats,
        ambiguousAttachment,
        lowConfidence,
        neverAssume: neverAssumeBlocking,
      })
    : [];

  if (attachmentMissing) {
    clarification_questions.unshift(
      "対象のファイルまたは画像が添付されていません。ファイルを送ってください。",
    );
    while (clarification_questions.length > 3) clarification_questions.pop();
  }

  const assumptions = [
    ...fieldInfo.assumptions,
    ...(input.overrides?.assumptions ?? []),
  ];
  if (requested_outputs.some((o) => o.format === "pptx")) {
    assumptions.push("PowerPointは16:9");
  }
  if (requested_outputs.some((o) => o.format === "xlsx")) {
    assumptions.push("Excelは1行目をヘッダー");
  }
  if (requested_outputs.some((o) => o.format === "pdf")) {
    assumptions.push("PDFは縦向きA4（表が広い場合は横向きを検討）");
  }

  const risks: string[] = [];
  if (actions.wantsExternalSend) {
    risks.push("external_action_requires_confirmation");
  }
  if (actions.wantsAutomation) {
    risks.push("automation_requires_confirmation");
  }
  if (fieldInfo.required_fields.some((f) => f.level === "never_assume")) {
    risks.push("never_assume_fields_present");
  }

  const missing_required_fields = [
    ...effectiveHardMissing,
    ...neverAssumeBlocking,
    ...(attachmentMissing ? ["attachment"] : []),
  ];

  let router_target = resolveRouterTarget(
    execution_mode,
    intent,
    needs_clarification,
    wantsVision,
  );

  if (unsupported_reason) {
    router_target = "unsupported";
  }

  const recommended_workflow = buildWorkflow({
    executionMode: execution_mode,
    outputs: requested_outputs,
    sources,
    wantsVision: wantsVision && !needs_clarification,
    wantsExternal: actions.wantsExternalSend && !input.overrides?.skip_external,
    wantsAutomation: actions.wantsAutomation && !input.overrides?.skip_automation,
    needsClarify: needs_clarification,
  });

  const user_summary = (() => {
    if (unsupported_reason) return unsupported_reason;
    if (execution_mode === "conversion") {
      return `${actions.convertSourceHint ?? primaryFile?.type ?? "ファイル"}を${actions.convertTarget ?? primaryFormat ?? "別形式"}へ変換`;
    }
    if (wantsVision && kind === "household") return "レシート等の画像から家計簿を作成";
    if (resolvedKind === "minutes") return "議事録を作成";
    if (resolvedKind === "estimate") return "見積書を作成";
    if (resolvedKind === "invoice") return "請求書を作成";
    if (resolvedKind === "sales_deck") return "営業資料を作成";
    if (actions.wantsDraftOnly && /投稿文/.test(assignment)) return "SNS投稿文を作成（投稿はしない）";
    if (actions.wantsDraftOnly && /メール文/.test(assignment)) return "メール文を作成（送信はしない）";
    if (actions.wantsExternalSend && /投稿/.test(assignment)) return "外部SNSへ投稿";
    if (actions.wantsExternalSend && /メール/.test(assignment)) return "メールを送信";
    if (actions.wantsAutomation) return "定期実行の自動化を設定";
    if (execution_mode === "analysis") return "ファイル内容の解析・要約";
    if (primaryFormat === "xlsx") return "表・Excel成果物を作成";
    if (primaryFormat === "pdf") return "提出用PDFを作成";
    if (primaryFormat === "docx") return "Word文書を作成";
    if (primaryFormat === "pptx") return "プレゼン資料を作成";
    return assignment.slice(0, 80) || "依頼を処理";
  })();

  const parsed: ParsedRequest = {
    request_id,
    intent: unsupported_reason
      ? "unsupported"
      : needs_clarification
        ? "needs_input"
        : intent,
    task_category,
    document_kind: resolvedKind,
    execution_mode,
    requested_outputs,
    source_inputs: sources,
    detected_entities: {
      deictic,
      wantsVision,
      convertTarget: actions.convertTarget,
      recurring: actions.wantsAutomation,
      scheduleOnce: actions.wantsScheduleOnce,
      draftOnly: actions.wantsDraftOnly,
      attachmentCount: attachments.length,
    },
    required_fields: fieldInfo.required_fields,
    missing_required_fields,
    optional_fields: fieldInfo.optional_fields,
    assumptions: [...new Set(assumptions)],
    risks,
    needs_clarification,
    clarification_questions,
    confidence,
    confidence_breakdown,
    recommended_workflow,
    user_summary,
    router_target,
    unsupported_reason,
    alternatives,
    fallback_used,
    diagnostic_id,
  };

  // Apply UI summary enrichment
  parsed.user_summary = parsed.user_summary;
  void summarizeForUser(parsed);

  const validation = validateParsedRequest(parsed);
  if (!validation.ok) {
    // Soft-repair: keep routing decision, surface schema issues as risk only.
    // Do not collapse high-risk external/automation into a fake "what format?" ask.
    if (
      parsed.execution_mode === "external_action" ||
      parsed.execution_mode === "automation" ||
      parsed.execution_mode === "mixed"
    ) {
      return {
        ...parsed,
        risks: [
          ...parsed.risks,
          `schema_soft_fail:${validation.errors.slice(0, 2).join(";")}`,
        ],
        fallback_used: true,
      };
    }
    return {
      ...parsed,
      intent: "needs_input",
      needs_clarification: true,
      clarification_questions: [
        "依頼内容を解釈できませんでした。作りたい成果物の種類を教えてください。",
      ],
      router_target: "needs_input",
      risks: [...parsed.risks, "schema_validation_failed"],
      fallback_used: true,
      confidence: Math.min(parsed.confidence, 0.35),
    };
  }
  return validation.value;
}

/** Map understanding outputs to deliverable format strings used by engine. */
export function formatsFromParsedRequest(parsed: ParsedRequest): string[] {
  const mapped = parsed.requested_outputs
    .filter((o) => o.format !== "none" && o.format !== "image")
    .map((o) => {
      if (o.format === "markdown") return "md";
      return o.format;
    });
  return mapped.length ? mapped : ["md", "txt", "pdf"];
}
