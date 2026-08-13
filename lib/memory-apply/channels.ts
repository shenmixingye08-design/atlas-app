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
  x_post: ["x_post", "sns", "twitter", "x", "tweet", "sns_post"],
  wordpress: ["wordpress", "blog", "wp", "wordpress_post"],
  email: ["email", "mail", "gmail"],
  word: ["word", "docx", "document", "pdf", "pptx", "xlsx"],
  artifact: ["artifact", "general", "document"],
};

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
    /今後は?\s*全部|すべて(短く|丁寧)|どの(仕事|投稿|記事)でも|毎回すべて|全体として|全部の(仕事|投稿|記事)/.test(
      trimmed,
    );
  const x = /(?:X投稿|ツイート|Twitter|\bXは|\bXを|\bXで|x_post|sns投稿)/i.test(
    trimmed,
  );
  const wordpress =
    /WordPress|ワードプレス|ブログ|WP記事|wordpress/i.test(trimmed);
  const email = /メール|email|gmail/i.test(trimmed);
  const word = /(?:Word文書|ワード文書|\bdocx\b|資料は)/i.test(trimmed);

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
