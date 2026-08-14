/**
 * Channel / artifact scope for Personal Memory.
 * Reuses appliesTo.artifactTypes — does not invent a new durable store.
 */

export type MemoryArtifactChannel =
  | "x_post"
  | "wordpress"
  | "email"
  | "word"
  | "artifact";

export const MEMORY_CHANNEL_ALIASES: Record<
  MemoryArtifactChannel,
  readonly string[]
> = {
  x_post: ["x_post", "sns", "twitter", "x", "tweet", "sns_post", "social_post"],
  wordpress: ["wordpress", "blog", "wp", "wordpress_post"],
  email: ["email", "mail", "gmail"],
  word: ["word", "docx", "document", "pdf", "pptx", "xlsx"],
  artifact: ["artifact", "general", "document"],
};

/** Generic content-classifier labels — never win over destination / step type. */
const GENERIC_CLASSIFIER_TYPES = new Set([
  "document",
  "artifact",
  "general",
  "short_document",
  "report",
  "proposal",
  "presentation",
  "research",
]);

export function expandArtifactTypes(
  types: readonly string[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const raw of types ?? []) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    out.add(key);
    for (const [canonical, aliases] of Object.entries(MEMORY_CHANNEL_ALIASES) as Array<
      [MemoryArtifactChannel, readonly string[]]
    >) {
      if (canonical === key || aliases.includes(key)) {
        out.add(canonical);
        for (const alias of aliases) out.add(alias);
      }
    }
  }
  return out;
}

export function detectMemoryChannel(text: string): {
  channel: MemoryArtifactChannel;
  global: boolean;
  artifactTypes: string[];
} {
  const trimmed = text.trim();
  const wantsGlobal =
    /今後は?\s*全部|これから全部|すべて(短く|丁寧)|どの(仕事|投稿|記事)でも|毎回すべて|全体として|全部の(仕事|投稿|記事)/.test(
      trimmed,
    );
  const x =
    /(?:X投稿|ツイート|Twitter|\bXは|\bXを|\bXで|\bXに|\bXへ|x_post|sns投稿|エックス)/i.test(
      trimmed,
    );
  const wordpress =
    /WordPress|ワードプレス|ブログ|WP記事|wordpress/i.test(trimmed);
  const email = /メール|email|gmail/i.test(trimmed);
  const word = /(?:Word文書|ワード文書|\bdocx\b|資料は)/i.test(trimmed);
  const household = /家計簿/.test(trimmed);
  const company =
    /会社用|社内文書|ビジネス文書|会社の(資料|文書|文体)/.test(trimmed);

  if (household && !x) {
    return {
      channel: "artifact",
      global: false,
      artifactTypes: ["household"],
    };
  }
  if (company && !x && !wordpress) {
    return {
      channel: "word",
      global: false,
      artifactTypes: ["word", "company"],
    };
  }

  if (wantsGlobal && !x && !wordpress && !email && !word) {
    return { channel: "artifact", global: true, artifactTypes: [] };
  }
  if (x && !wordpress) {
    return { channel: "x_post", global: false, artifactTypes: ["x_post"] };
  }
  if (wordpress && !x) {
    return {
      channel: "wordpress",
      global: false,
      artifactTypes: ["wordpress"],
    };
  }
  if (email && !x && !wordpress) {
    return { channel: "email", global: false, artifactTypes: ["email"] };
  }
  if (word && !x && !wordpress) {
    return { channel: "word", global: false, artifactTypes: ["word"] };
  }
  return { channel: "artifact", global: true, artifactTypes: [] };
}

export function channelFromStepType(
  stepType: string | null | undefined,
): MemoryArtifactChannel {
  switch (stepType) {
    case "x_post":
      return "x_post";
    case "wordpress":
      return "wordpress";
    case "gmail":
      return "email";
    case "word_generate":
    case "pdf_generate":
    case "excel_generate":
    case "powerpoint_generate":
    case "deliverable_generate":
      return "word";
    default:
      return "artifact";
  }
}

export function artifactTypesForChannel(
  channel: MemoryArtifactChannel,
): string[] {
  if (channel === "artifact") return [];
  return [channel];
}

/**
 * Memory scope for retrieval.
 * Explicit destination and actual workflow step types beat generic
 * content classification (`document` / `artifact`).
 */
export function resolveMemoryArtifactTypes(input: {
  assignment?: string | null;
  stepTypes?: readonly string[] | null;
  classifierTypes?: readonly string[] | null;
}): string[] {
  const destinations = new Set<MemoryArtifactChannel>();

  for (const step of input.stepTypes ?? []) {
    const channel = channelFromStepType(step);
    if (channel !== "artifact") destinations.add(channel);
  }

  for (const raw of input.classifierTypes ?? []) {
    const asStep = channelFromStepType(raw);
    if (asStep !== "artifact") destinations.add(asStep);
  }

  if (input.assignment?.trim()) {
    const detected = detectMemoryChannel(input.assignment);
    if (detected.channel !== "artifact") {
      destinations.add(detected.channel);
    }
  }

  if (destinations.size > 0) {
    return [...destinations].flatMap((channel) =>
      artifactTypesForChannel(channel),
    );
  }

  return [
    ...new Set(
      (input.classifierTypes ?? [])
        .map((type) => type.trim().toLowerCase())
        .filter((type) => type.length > 0 && !GENERIC_CLASSIFIER_TYPES.has(type)),
    ),
  ];
}
