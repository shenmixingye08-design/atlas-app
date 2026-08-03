import type { PostVerification } from "@/lib/integration-platform/types";

export function verifyWordPressPost(input: {
  postId: string | number | null | undefined;
  link: string | null | undefined;
  status: string | null | undefined;
  fetched?: {
    id: string | number | null;
    link: string | null;
    status: string | null;
  } | null;
}): PostVerification {
  const externalId =
    input.postId == null || input.postId === ""
      ? null
      : String(input.postId);
  const externalUrl = input.link?.trim() || null;
  const publicStatus = input.status ?? null;

  if (!externalId || !externalUrl) {
    return {
      posted: false,
      externalId,
      externalUrl,
      publicStatus,
      fetchVerified: false,
    };
  }

  const fetched = input.fetched;
  const fetchVerified = Boolean(
    fetched &&
      String(fetched.id) === externalId &&
      (fetched.link == null || fetched.link === externalUrl),
  );

  return {
    posted: true,
    externalId,
    externalUrl,
    publicStatus,
    fetchVerified,
  };
}

export function verifyXPost(input: {
  tweetId: string | null | undefined;
  tweetUrl: string | null | undefined;
  fetchedExists?: boolean;
}): PostVerification {
  const externalId = input.tweetId?.trim() || null;
  const externalUrl = input.tweetUrl?.trim() || null;
  if (!externalId || !externalUrl) {
    return {
      posted: false,
      externalId,
      externalUrl,
      publicStatus: null,
      fetchVerified: false,
    };
  }
  return {
    posted: true,
    externalId,
    externalUrl,
    publicStatus: "published",
    fetchVerified: input.fetchedExists === true,
  };
}

export function postVerificationOk(v: PostVerification): boolean {
  return v.posted && Boolean(v.externalId) && Boolean(v.externalUrl) && v.fetchVerified;
}
