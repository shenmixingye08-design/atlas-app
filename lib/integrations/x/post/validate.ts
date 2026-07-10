import type { XPostValidationSummary } from "./types";

export const X_TWEET_MAX_CHARS = 280;

const URL_PATTERN =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

const MENTION_PATTERN = /(^|\s)@([A-Za-z0-9_]+)/g;

const HASHTAG_PATTERN = /(^|\s)#([\p{L}\p{N}_]+)/gu;

function countTweetChars(text: string): number {
  return [...text].length;
}

function extractUrls(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map((match) => match[0] ?? "").filter(Boolean);
}

function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const username = match[2];
    if (username) mentions.push(`@${username}`);
  }
  return mentions;
}

function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const tag = match[2];
    if (tag) tags.push(`#${tag}`);
  }
  return tags;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidMention(mention: string): boolean {
  return /^@[A-Za-z0-9_]{1,15}$/.test(mention);
}

function isValidHashtag(hashtag: string): boolean {
  return /^#[\p{L}\p{N}_]+$/u.test(hashtag);
}

/** Validate tweet text before posting to X. */
export function validateTweetText(text: string): XPostValidationSummary {
  const trimmed = text.trim();
  const charCount = countTweetChars(trimmed);
  const urls = extractUrls(trimmed);
  const mentions = extractMentions(trimmed);
  const hashtags = extractHashtags(trimmed);
  const errors: string[] = [];

  if (!trimmed) {
    errors.push("投稿文が空です");
  }

  if (charCount > X_TWEET_MAX_CHARS) {
    errors.push(`文字数が上限（${X_TWEET_MAX_CHARS}）を超えています（${charCount}文字）`);
  }

  for (const url of urls) {
    if (!isValidUrl(url)) {
      errors.push(`無効なURL: ${url}`);
    }
  }

  for (const mention of mentions) {
    if (!isValidMention(mention)) {
      errors.push(`無効なメンション: ${mention}`);
    }
  }

  for (const hashtag of hashtags) {
    if (!isValidHashtag(hashtag)) {
      errors.push(`無効なハッシュタグ: ${hashtag}`);
    }
  }

  return {
    charCount,
    maxChars: X_TWEET_MAX_CHARS,
    urls,
    mentions,
    hashtags,
    errors,
  };
}

export function isTweetTextValid(text: string): boolean {
  return validateTweetText(text).errors.length === 0;
}
