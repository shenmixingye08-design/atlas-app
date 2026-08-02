import type {
  CorrectionSignal,
  CorrectionSignalKind,
  WorkflowLearningCandidateType,
  WorkflowLearningPatch,
  WorkflowLearningThresholds,
} from "@/lib/workflow-learning/types";
import { sanitizeLearningText } from "@/lib/workflow-learning/security";

type KindRule = {
  kind: CorrectionSignalKind;
  re: RegExp;
  isPreference: boolean;
  thresholdKey: keyof WorkflowLearningThresholds;
  candidateType: WorkflowLearningCandidateType;
  buildPatch: (signals: CorrectionSignal[]) => WorkflowLearningPatch | null;
  summary: (count: number) => string;
  reason: (count: number) => string;
};

export const CORRECTION_RULES: KindRule[] = [
  {
    kind: "shorten_copy",
    re: /もっと短く|短めに|簡潔に|短くして/,
    isPreference: true,
    thresholdKey: "shortenCopy",
    candidateType: "setting_change",
    buildPatch: () => ({
      kind: "instruction_preference_hint",
      note: "短めの文体を優先（詳細な好みは記憶へ）",
    }),
    summary: (n) => `過去${n}回、文章を短く修正しています。次回から短めにしますか？`,
    reason: (n) => `${n}回の同種修正が確認されました`,
  },
  {
    kind: "color_change",
    re: /青系|赤系|緑系|モノクロ|配色|カラー/,
    isPreference: true,
    thresholdKey: "colorChange",
    candidateType: "setting_change",
    buildPatch: (signals) => ({
      kind: "instruction_preference_hint",
      note: sanitizeLearningText(signals[0]?.text ?? "配色の好み"),
    }),
    summary: (n) => `過去${n}回、配色を同じ方向へ修正しています。次回から反映しますか？`,
    reason: (n) => `${n}回の配色修正`,
  },
  {
    kind: "save_destination",
    re: /保存先|フォルダ|Drive|Dropbox|保存して/,
    isPreference: false,
    thresholdKey: "saveDestination",
    candidateType: "save_destination",
    buildPatch: (signals) => ({
      kind: "instruction_preference_hint",
      note: sanitizeLearningText(`保存先の変更: ${signals[0]?.text ?? ""}`),
    }),
    summary: (n) => `過去${n}回、保存先を変更しています。次回から既定にしますか？`,
    reason: (n) => `${n}回の保存先変更`,
  },
  {
    kind: "artifact_add",
    re: /PDFも|Excelも|追加で|もう一つ/,
    isPreference: false,
    thresholdKey: "artifactAdd",
    candidateType: "artifact_format",
    buildPatch: () => ({
      kind: "instruction_preference_hint",
      note: "追加成果物形式を既定に含める",
    }),
    summary: (n) => `過去${n}回、成果物を追加しています。次回から含めますか？`,
    reason: (n) => `${n}回の成果物追加`,
  },
  {
    kind: "artifact_remove",
    re: /(?:成果物|ファイル|PDF|Excel).*(?:いらない|不要|削除)|(?:いらない|不要)(?:成果物|ファイル)/,
    isPreference: false,
    thresholdKey: "artifactRemove",
    candidateType: "artifact_format",
    buildPatch: () => ({
      kind: "instruction_preference_hint",
      note: "不要な成果物形式を既定から外す",
    }),
    summary: (n) => `過去${n}回、成果物を減らしています。次回から省略しますか？`,
    reason: (n) => `${n}回の成果物削除`,
  },
  {
    kind: "step_disable",
    re: /このステップ(不要|いらない)|ステップを(止め|無効)|ステップ不要/,
    isPreference: false,
    thresholdKey: "stepDisable",
    candidateType: "step_disable",
    buildPatch: () => null,
    summary: (n) => `過去${n}回、同じStepを無効にしています。次回から無効にしますか？`,
    reason: (n) => `${n}回のStep無効化`,
  },
  {
    kind: "approval_policy",
    re: /毎回確認|承認なし|自動で実行|確認してから/,
    isPreference: false,
    thresholdKey: "approvalPolicy",
    candidateType: "approval_policy",
    buildPatch: (signals) => {
      const text = signals[0]?.text ?? "";
      if (/承認なし|自動で実行/.test(text)) {
        return {
          kind: "execution_policy",
          executionPolicy: { mode: "run_then_notify" },
        };
      }
      return {
        kind: "execution_policy",
        executionPolicy: { mode: "review_before_run" },
      };
    },
    summary: (n) => `過去${n}回、承認の方針を変更しています。次回から反映しますか？`,
    reason: (n) => `${n}回の承認方針変更`,
  },
  {
    kind: "notification_policy",
    re: /通知(いらない|不要|減ら|増)|お知らせ/,
    isPreference: false,
    thresholdKey: "notificationPolicy",
    candidateType: "notification_policy",
    buildPatch: () => ({
      kind: "notification_policy",
      notificationPolicy: {},
    }),
    summary: (n) => `過去${n}回、通知の方針を変更しています。次回から反映しますか？`,
    reason: (n) => `${n}回の通知方針変更`,
  },
  {
    kind: "filename",
    re: /ファイル名|名前を|リネーム/,
    isPreference: true,
    thresholdKey: "filename",
    candidateType: "setting_change",
    buildPatch: (signals) => ({
      kind: "instruction_preference_hint",
      note: sanitizeLearningText(signals[0]?.text ?? "ファイル名の好み"),
    }),
    summary: (n) => `過去${n}回、ファイル名を修正しています。次回から合わせますか？`,
    reason: (n) => `${n}回のファイル名修正`,
  },
  {
    kind: "step_order",
    re: /順番|順序|先に|あとで.*ステップ/,
    isPreference: false,
    thresholdKey: "stepOrder",
    candidateType: "step_order",
    buildPatch: () => null, // filled by analyzer with concrete step ids when available
    summary: (n) => `過去${n}回、Stepの順番を変えています。次回からその順にしますか？`,
    reason: (n) => `${n}回のStep順変更`,
  },
];

export function classifyCorrectionText(text: string): {
  kind: CorrectionSignalKind;
  isPreference: boolean;
} | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const rule of CORRECTION_RULES) {
    if (rule.re.test(trimmed)) {
      return { kind: rule.kind, isPreference: rule.isPreference };
    }
  }
  if (/ステップ|workflow|順序|タイムアウト|retry|リトライ/i.test(trimmed)) {
    return { kind: "other_structural", isPreference: false };
  }
  return null;
}

export function countSignalsByFingerprint(
  signals: CorrectionSignal[],
  fingerprint: string,
): number {
  return signals.filter((s) => s.fingerprint === fingerprint).length;
}

export function groupSignalsByFingerprint(
  signals: CorrectionSignal[],
): Map<string, CorrectionSignal[]> {
  const map = new Map<string, CorrectionSignal[]>();
  for (const signal of signals) {
    const list = map.get(signal.fingerprint) ?? [];
    list.push(signal);
    map.set(signal.fingerprint, list);
  }
  return map;
}

export function ruleForKind(kind: CorrectionSignalKind): KindRule | null {
  return CORRECTION_RULES.find((r) => r.kind === kind) ?? null;
}
