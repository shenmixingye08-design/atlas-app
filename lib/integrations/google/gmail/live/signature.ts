/**
 * Signature resolution — PersonalizationContext or explicit config.
 * Never duplicates signature blocks; missing signature does not break body.
 */

export type SignatureSource = {
  text?: string | null;
  html?: string | null;
};

function alreadyHasSignature(body: string, signature: string): boolean {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  const normalizedSig = signature.replace(/\s+/g, " ").trim();
  if (!normalizedSig) return true;
  return normalizedBody.includes(normalizedSig);
}

export function resolveGmailSignature(input: {
  explicitText?: string | null;
  explicitHtml?: string | null;
  profileId?: string | null;
  personalization?: {
    signatureText?: string | null;
    signatureHtml?: string | null;
    companySignatureText?: string | null;
    companySignatureHtml?: string | null;
  } | null;
}): SignatureSource {
  if (input.explicitText?.trim() || input.explicitHtml?.trim()) {
    return {
      text: input.explicitText?.trim() || null,
      html: input.explicitHtml?.trim() || null,
    };
  }

  // Explicit profile id currently maps to personalization fields when present.
  void input.profileId;

  const userText = input.personalization?.signatureText?.trim() || null;
  const userHtml = input.personalization?.signatureHtml?.trim() || null;
  if (userText || userHtml) {
    return { text: userText, html: userHtml };
  }

  const companyText =
    input.personalization?.companySignatureText?.trim() || null;
  const companyHtml =
    input.personalization?.companySignatureHtml?.trim() || null;
  if (companyText || companyHtml) {
    return { text: companyText, html: companyHtml };
  }

  return { text: null, html: null };
}

export function applyGmailSignature(input: {
  textBody: string;
  htmlBody: string | null;
  signature: SignatureSource;
  isReply: boolean;
}): { textBody: string; htmlBody: string | null } {
  const sigText = input.signature.text?.trim() || "";
  const sigHtml = input.signature.html?.trim() || "";

  if (!sigText && !sigHtml) {
    return { textBody: input.textBody, htmlBody: input.htmlBody };
  }

  // Reply policy: append once below the reply body (do not invent quoted history).
  let textBody = input.textBody;
  if (sigText && !alreadyHasSignature(textBody, sigText)) {
    textBody = `${textBody.trimEnd()}\n\n--\n${sigText}`;
  }

  let htmlBody = input.htmlBody;
  if (htmlBody && sigHtml && !alreadyHasSignature(htmlBody, sigHtml)) {
    htmlBody = `${htmlBody.trimEnd()}<br/><br/>--<br/>${sigHtml}`;
  } else if (htmlBody && !sigHtml && sigText && !alreadyHasSignature(htmlBody, sigText)) {
    const escaped = sigText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    htmlBody = `${htmlBody.trimEnd()}<br/><br/>--<br/>${escaped}`;
  }

  void input.isReply;
  return { textBody, htmlBody };
}
