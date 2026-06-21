"use client";

import { useMemo } from "react";

const URL_PATTERN =
  /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]}!?])/gi;

export const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🙏"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function normalizeUrl(raw: string) {
  const trimmed = raw.replace(/[),.!?]+$/g, "");
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function extractFirstUrl(text: string) {
  const match = text.match(URL_PATTERN);
  if (!match?.[0]) {
    return null;
  }
  return normalizeUrl(match[0]);
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type MessageBodyProps = {
  text: string;
  showLinkPreview?: boolean;
};

export default function MessageBody({
  text,
  showLinkPreview = true,
}: MessageBodyProps) {
  const firstUrl = useMemo(
    () => (showLinkPreview ? extractFirstUrl(text) : null),
    [showLinkPreview, text],
  );

  const parts = useMemo(() => {
    const segments: Array<{ type: "text" | "link"; value: string }> = [];
    let lastIndex = 0;
    const pattern = new RegExp(URL_PATTERN.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }

      const raw = match[0];
      segments.push({ type: "link", value: normalizeUrl(raw) });
      lastIndex = match.index + raw.length;
    }

    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }

    return segments;
  }, [text]);

  return (
    <>
      <span className="message-copy">
        {parts.map((part, index) =>
          part.type === "link" ? (
            <a
              className="message-link"
              href={part.value}
              key={`${part.value}-${index}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {part.value}
            </a>
          ) : (
            <span key={`text-${index}`}>{part.value}</span>
          ),
        )}
      </span>
      {firstUrl ? (
        <a
          className="message-link-preview"
          href={firstUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="message-link-preview-host">{getHostname(firstUrl)}</span>
          <span className="message-link-preview-url">{firstUrl}</span>
        </a>
      ) : null}
    </>
  );
}
