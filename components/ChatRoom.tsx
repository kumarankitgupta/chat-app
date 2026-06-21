"use client";

import {
  ChangeEvent,
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  LogOut,
  Send,
  SmilePlus,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { MEDIA_BUCKET, supabase } from "@/lib/supabase/client";
import MediaViewer from "@/components/MediaViewer";
import MessageBody from "@/components/MessageBody";
import { ensurePushSubscription } from "@/lib/push-client";
import {
  REACTION_EMOJIS,
  type ReactionEmoji,
} from "@/components/MessageBody";

type MediaType = "image" | "video";

type Message = {
  id: string;
  body: string | null;
  media_url: string | null;
  media_path: string | null;
  media_type: MediaType | null;
  sender_id: string;
  sender_name: string;
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  reply_to_sender_name: string | null;
  reply_to_body: string | null;
  reply_to_media_type: MediaType | null;
};

type ReplyTarget = Pick<
  Message,
  "id" | "sender_name" | "body" | "media_type"
>;

type Presence = {
  session_id: string;
  display_name: string;
  last_seen: string;
  is_typing?: boolean;
  typing_updated_at?: string | null;
};

type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: ReactionEmoji;
  created_at: string;
};

type TimelineItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; message: Message };

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const CHAT_USERS = ["bubu", "buggu"] as const;
const CHAT_USER_STORAGE_KEY = "private-chat-user";
const DOUBLE_TAP_MS = 320;
const REPLY_HIGHLIGHT_MS = 900;
const TYPING_TTL_MS = 4000;
const TYPING_CLEAR_MS = 2000;
const TYPING_PING_MS = 2500;
const LONG_PRESS_MS = 500;
const UNREAD_DISMISS_MS = 2200;

type ChatUser = (typeof CHAT_USERS)[number];

function isChatUser(value: string | null): value is ChatUser {
  return CHAT_USERS.includes(value as ChatUser);
}

function getStoredUser() {
  const storedUser = window.sessionStorage.getItem(CHAT_USER_STORAGE_KEY);
  return isChatUser(storedUser) ? storedUser : null;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFullDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateSeparator(value: string) {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameCalendarDay(date, now)) {
    return "Today";
  }

  if (isSameCalendarDay(date, yesterday)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
}

function buildMessageTimeline(messages: Message[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDateKey = "";

  for (const message of messages) {
    const dateKey = message.created_at.slice(0, 10);
    if (dateKey !== lastDateKey) {
      items.push({
        type: "date",
        key: `date-${dateKey}`,
        label: formatDateSeparator(message.created_at),
      });
      lastDateKey = dateKey;
    }

    items.push({ type: "message", message });
  }

  return items;
}

function isPresenceTyping(
  presence?: Pick<Presence, "is_typing" | "typing_updated_at">,
) {
  if (!presence?.is_typing || !presence.typing_updated_at) {
    return false;
  }

  return (
    Date.now() - new Date(presence.typing_updated_at).getTime() < TYPING_TTL_MS
  );
}

function groupReactions(reactions: MessageReaction[]) {
  const grouped = new Map<
    ReactionEmoji,
    { emoji: ReactionEmoji; users: string[] }
  >();

  for (const reaction of reactions) {
    const existing = grouped.get(reaction.emoji);
    if (existing) {
      existing.users.push(reaction.user_id);
    } else {
      grouped.set(reaction.emoji, {
        emoji: reaction.emoji,
        users: [reaction.user_id],
      });
    }
  }

  return [...grouped.values()];
}

function applyPresenceUpdate(current: Presence[], next: Presence) {
  const previous = current.find(
    (presence) => presence.session_id === next.session_id,
  );

  if (
    previous &&
    previous.last_seen === next.last_seen &&
    previous.is_typing === next.is_typing &&
    previous.typing_updated_at === next.typing_updated_at
  ) {
    return current;
  }

  return [
    ...current.filter((presence) => presence.session_id !== next.session_id),
    next,
  ];
}

function getContactStatus(presence?: Presence) {
  if (!presence) {
    return "last seen not available yet";
  }

  if (isPresenceTyping(presence)) {
    return "typing...";
  }

  const secondsSinceSeen =
    (Date.now() - new Date(presence.last_seen).getTime()) / 1000;

  if (secondsSinceSeen < 45) {
    return "online";
  }

  return `last seen ${formatFullDateTime(presence.last_seen)}`;
}

function sortMessages(messages: Message[]) {
  return [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function getMessagePreview(message: Pick<Message, "body" | "media_type">) {
  if (message.body?.trim()) {
    return message.body.trim();
  }

  if (message.media_type === "image") {
    return "Photo";
  }

  if (message.media_type === "video") {
    return "Video";
  }

  return "Message";
}

function isSingleEmoji(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = [...segmenter.segment(trimmed)].map(
      (part) => part.segment,
    );

    if (segments.length !== 1) {
      return false;
    }

    return /\p{Extended_Pictographic}/u.test(segments[0]!);
  }

  const emojis = trimmed.match(/\p{Extended_Pictographic}/gu);
  if (!emojis || emojis.length !== 1) {
    return false;
  }

  const withoutEmojiParts = trimmed
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D/gu, "")
    .trim();

  return withoutEmojiParts.length === 0;
}

function isSingleEmojiMessage(
  message: Pick<Message, "body" | "media_url" | "media_type" | "reply_to_id">,
) {
  if (message.media_url || message.media_type || message.reply_to_id) {
    return false;
  }

  if (!message.body?.trim()) {
    return false;
  }

  return isSingleEmoji(message.body);
}

function toReplyTarget(message: Message): ReplyTarget {
  return {
    id: message.id,
    sender_name: message.sender_name,
    body: message.body,
    media_type: message.media_type,
  };
}

function isUploadableMedia(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

const MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGES_LOAD = 500;

const MESSAGE_SELECT_BASE =
  "id, body, media_url, media_path, media_type, sender_id, sender_name, created_at, read_at";

const MESSAGE_SELECT_WITH_REPLY = `${MESSAGE_SELECT_BASE}, reply_to_id, reply_to_sender_name, reply_to_body, reply_to_media_type`;

let replyColumnsSupported: boolean | null = null;
let typingColumnsSupported: boolean | null = null;
let reactionsTableSupported: boolean | null = null;

function normalizeMessage(raw: Partial<Message> & Pick<Message, "id" | "created_at" | "sender_id" | "sender_name">): Message {
  return {
    id: raw.id,
    body: raw.body ?? null,
    media_url: raw.media_url ?? null,
    media_path: raw.media_path ?? null,
    media_type: raw.media_type ?? null,
    sender_id: raw.sender_id,
    sender_name: raw.sender_name,
    created_at: raw.created_at,
    read_at: raw.read_at ?? null,
    reply_to_id: raw.reply_to_id ?? null,
    reply_to_sender_name: raw.reply_to_sender_name ?? null,
    reply_to_body: raw.reply_to_body ?? null,
    reply_to_media_type: raw.reply_to_media_type ?? null,
  };
}

function mergeMessagesById(...groups: Message[][]): Message[] {
  const byId = new Map<string, Message>();

  for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message);
    }
  }

  return sortMessages([...byId.values()]);
}

function isMissingReplyColumnError(error: { message?: string; code?: string }) {
  return (
    error.code === "42703" ||
    error.message?.includes("reply_to_id") ||
    error.message?.includes("reply_to_body") ||
    error.message?.includes("reply_to_sender_name") ||
    error.message?.includes("reply_to_media_type")
  );
}

async function queryMessages(options?: {
  before?: string;
  limit?: number;
  count?: boolean;
}) {
  const limit = options?.limit ?? MESSAGE_PAGE_SIZE;
  const selectOptions = options?.count ? { count: "exact" as const } : undefined;

  const buildQuery = (select: string) => {
    let query = supabase
      .from("messages")
      .select(select, selectOptions)
      .in("sender_id", [...CHAT_USERS])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options?.before) {
      query = query.lt("created_at", options.before);
    }

    return query;
  };

  if (replyColumnsSupported !== false) {
    const withReply = await buildQuery(MESSAGE_SELECT_WITH_REPLY);

    if (!withReply.error) {
      replyColumnsSupported = true;
      return {
        ...withReply,
        data: (withReply.data ?? []).map((row) =>
          normalizeMessage(row as unknown as Message),
        ),
      };
    }

    if (isMissingReplyColumnError(withReply.error)) {
      replyColumnsSupported = false;
    } else {
      return { ...withReply, data: null };
    }
  }

  const base = await buildQuery(MESSAGE_SELECT_BASE);

  return {
    ...base,
    data: base.data
      ? base.data.map((row) => normalizeMessage(row as unknown as Message))
      : null,
  };
}

async function loadAllMessages() {
  const { data: firstPage, error, count } = await queryMessages({
    limit: MESSAGE_PAGE_SIZE,
    count: true,
  });

  if (error) {
    return { messages: [] as Message[], count: 0, error };
  }

  let loaded = firstPage ?? [];

  while (
    loaded.length < MAX_MESSAGES_LOAD &&
    loaded.length < (count ?? 0) &&
    loaded.length > 0
  ) {
    const oldestLoaded = loaded.reduce((oldest, message) =>
      new Date(message.created_at).getTime() <
      new Date(oldest.created_at).getTime()
        ? message
        : oldest,
    );

    const { data: olderPage, error: olderError } = await queryMessages({
      before: oldestLoaded.created_at,
      limit: MESSAGE_PAGE_SIZE,
    });

    if (olderError || !olderPage?.length) {
      break;
    }

    const previousCount = loaded.length;
    loaded = mergeMessagesById(loaded, olderPage);

    if (loaded.length === previousCount || olderPage.length < MESSAGE_PAGE_SIZE) {
      break;
    }
  }

  return {
    messages: sortMessages(loaded),
    count: count ?? loaded.length,
    error: null,
  };
}

const SCROLL_BOTTOM_THRESHOLD = 80;

function isNearBottom(container: HTMLElement, threshold = SCROLL_BOTTOM_THRESHOLD) {
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= threshold;
}

function scrollContainerToBottom(
  container: HTMLElement,
  behavior: ScrollBehavior = "auto",
) {
  if (behavior === "smooth") {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return;
  }

  container.scrollTop = container.scrollHeight;
}

function scheduleScrollToBottom(
  container: HTMLElement,
  behavior: ScrollBehavior = "auto",
) {
  const scroll = () => scrollContainerToBottom(container, behavior);

  requestAnimationFrame(() => {
    requestAnimationFrame(scroll);
  });
}

function messagesAreEqual(current: Message[], next: Message[]) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((message, index) => {
    const other = next[index];
    return (
      message.id === other.id &&
      message.body === other.body &&
      message.read_at === other.read_at &&
      message.media_url === other.media_url &&
      message.created_at === other.created_at &&
      message.reply_to_id === other.reply_to_id &&
      message.reply_to_body === other.reply_to_body
    );
  });
}

export default function ChatRoom() {
  const [senderId, setSenderId] = useState<ChatUser | "">("");
  const [senderName, setSenderName] = useState<ChatUser | "">("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [hasDraftText, setHasDraftText] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [activeMedia, setActiveMedia] = useState<{
    url: string;
    type: MediaType;
    alt?: string;
  } | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [statusTick, setStatusTick] = useState(0);
  const [activeUnreadMarkerId, setActiveUnreadMarkerId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const stickToBottomRef = useRef(true);
  const isViewingHistoryRef = useRef(false);
  const isPrependingOlderRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const hasCompletedInitialScrollRef = useRef(false);
  const forceScrollOnNextUpdateRef = useRef(false);
  const wasLoadingRef = useRef(true);
  const lastSeenLatestMessageIdRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const hasMoreMessagesRef = useRef(false);
  const isJumpingToMessageRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);
  const typingPingTimerRef = useRef<number | null>(null);
  const lastTypingPingRef = useRef(0);
  const isTypingActiveRef = useRef(false);
  const senderIdRef = useRef(senderId);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const draftTextRef = useRef("");
  const unreadDismissTimerRef = useRef<number | null>(null);

  const latestOtherPresence = useMemo(() => {
    return presences
      .filter((presence) => presence.session_id !== senderId)
      .sort(
        (a, b) =>
          new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
      )[0];
  }, [presences, senderId]);

  const contactName = useMemo(() => {
    if (!senderId) {
      return "";
    }

    return senderId === "bubu" ? "buggu" : "bubu";
  }, [senderId]);

  const contactStatus = useMemo(
    () => getContactStatus(latestOtherPresence),
    [latestOtherPresence, statusTick],
  );

  const messageTimeline = useMemo(
    () => buildMessageTimeline(messages),
    [messages],
  );

  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();

    for (const reaction of reactions) {
      const current = map.get(reaction.message_id) ?? [];
      current.push(reaction);
      map.set(reaction.message_id, current);
    }

    return map;
  }, [reactions]);

  const firstUnreadIncomingId = useMemo(() => {
    if (!senderId) {
      return null;
    }

    return (
      messages.find(
        (message) => message.sender_id !== senderId && !message.read_at,
      )?.id ?? null
    );
  }, [messages, senderId]);

  const unreadAnchorTimestamp = useMemo(() => {
    if (!activeUnreadMarkerId) {
      return null;
    }

    const anchor = messages.find((message) => message.id === activeUnreadMarkerId);
    return anchor ? new Date(anchor.created_at).getTime() : null;
  }, [activeUnreadMarkerId, messages]);

  const fetchMessages = useCallback(async (options?: { fullHistory?: boolean }) => {
    if (options?.fullHistory) {
      const { messages: loaded, count, error } = await loadAllMessages();

      if (error) {
        setNotice(
          "Could not load messages. Check your Supabase connection and try refreshing.",
        );
        return;
      }

      setMessages(loaded);
      setHasMoreMessages(count > loaded.length);
      setNotice(
        replyColumnsSupported === false
          ? "Reply feature needs supabase-reply-migration.sql. Other messages still work."
          : "",
      );
      return;
    }

    const { data, error, count } = await queryMessages({
      limit: MESSAGE_PAGE_SIZE,
      count: true,
    });

    if (error) {
      setNotice(
        "Could not load messages. Check your Supabase connection and try refreshing.",
      );
      return;
    }

    const fetched = data ?? [];

    setMessages((current) => {
      const merged = current.length
        ? mergeMessagesById(current, fetched)
        : sortMessages(fetched);
      setHasMoreMessages((count ?? 0) > merged.length);
      return merged;
    });
    setNotice(
      replyColumnsSupported === false
        ? "Reply feature needs supabase-reply-migration.sql. Other messages still work."
        : "",
    );
  }, []);

  const fetchOlderMessages = useCallback(async () => {
    if (!messages.length || isLoadingOlder) {
      return;
    }

    setIsLoadingOlder(true);
    const oldestMessage = messages[0];
    const oldestTimestamp = oldestMessage.created_at;

    const { data, error } = await queryMessages({
      before: oldestTimestamp,
      limit: MESSAGE_PAGE_SIZE,
    });

    if (error) {
      console.error("Error fetching older messages:", error);
      setIsLoadingOlder(false);
      return;
    }

    if (data && data.length > 0) {
      const container = messageListRef.current;
      if (container) {
        pendingScrollRestoreRef.current = {
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
        };
      }

      isPrependingOlderRef.current = true;
      stickToBottomRef.current = false;
      isViewingHistoryRef.current = true;

      setMessages((current) => mergeMessagesById(data, current));
      setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE);
    } else {
      setHasMoreMessages(false);
    }

    setIsLoadingOlder(false);
  }, [messages, isLoadingOlder]);

  const fetchPresences = useCallback(async () => {
    const withTyping = await supabase
      .from("chat_presence")
      .select("session_id, display_name, last_seen, is_typing, typing_updated_at")
      .in("session_id", [...CHAT_USERS])
      .order("last_seen", { ascending: false })
      .limit(20);

    if (!withTyping.error) {
      typingColumnsSupported = true;
      setPresences((withTyping.data ?? []) as Presence[]);
      return;
    }

    if (
      withTyping.error.code === "42703" ||
      withTyping.error.message?.includes("is_typing")
    ) {
      typingColumnsSupported = false;
    } else {
      return;
    }

    const base = await supabase
      .from("chat_presence")
      .select("session_id, display_name, last_seen")
      .in("session_id", [...CHAT_USERS])
      .order("last_seen", { ascending: false })
      .limit(20);

    setPresences((base.data ?? []) as Presence[]);
  }, []);

  const fetchReactions = useCallback(async () => {
    if (reactionsTableSupported === false) {
      return;
    }

    const { data, error } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji, created_at")
      .in("user_id", [...CHAT_USERS]);

    if (error) {
      if (error.code === "42P01" || error.message?.includes("message_reactions")) {
        reactionsTableSupported = false;
        setNotice(
          "Reactions need supabase-features-migration.sql. Run it in Supabase, then refresh.",
        );
      }
      return;
    }

    reactionsTableSupported = true;
    setReactions((data ?? []) as MessageReaction[]);
  }, []);

  const updatePresence = useCallback(
    async (options?: { isTyping?: boolean }) => {
      if (!senderId || !senderName) {
        return;
      }

      const payload: Record<string, string | boolean> = {
        session_id: senderId,
        display_name: senderName,
        last_seen: new Date().toISOString(),
      };

      if (typingColumnsSupported !== false && options?.isTyping !== undefined) {
        payload.is_typing = options.isTyping;
        payload.typing_updated_at = new Date().toISOString();
      }

      const withTyping = await supabase.from("chat_presence").upsert(payload);

      if (
        withTyping.error &&
        (withTyping.error.code === "42703" ||
          withTyping.error.message?.includes("is_typing"))
      ) {
        typingColumnsSupported = false;
        const { is_typing, typing_updated_at, ...basePayload } = payload;
        void is_typing;
        void typing_updated_at;
        await supabase.from("chat_presence").upsert(basePayload);
      }
    },
    [senderId, senderName],
  );

  const clearTyping = useCallback(async () => {
    if (!senderId || typingColumnsSupported === false) {
      return;
    }

    isTypingActiveRef.current = false;
    lastTypingPingRef.current = 0;

    if (typingPingTimerRef.current !== null) {
      window.clearTimeout(typingPingTimerRef.current);
      typingPingTimerRef.current = null;
    }

    await supabase
      .from("chat_presence")
      .update({
        is_typing: false,
        typing_updated_at: new Date().toISOString(),
      })
      .eq("session_id", senderId);
  }, [senderId]);

  const pingTyping = useCallback(() => {
    if (!senderId || typingColumnsSupported === false) {
      return;
    }

    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_MS) {
      return;
    }

    lastTypingPingRef.current = now;

    if (!isTypingActiveRef.current) {
      isTypingActiveRef.current = true;
      void updatePresence({ isTyping: true });
      return;
    }

    void supabase
      .from("chat_presence")
      .update({
        is_typing: true,
        typing_updated_at: new Date().toISOString(),
      })
      .eq("session_id", senderId);
  }, [senderId, updatePresence]);

  const queueTypingSignal = useCallback(() => {
    if (!senderId || typingColumnsSupported === false) {
      return;
    }

    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = window.setTimeout(() => {
      void clearTyping();
      typingTimerRef.current = null;
    }, TYPING_CLEAR_MS);

    if (typingPingTimerRef.current !== null) {
      return;
    }

    pingTyping();

    typingPingTimerRef.current = window.setTimeout(() => {
      typingPingTimerRef.current = null;
      if (isTypingActiveRef.current) {
        pingTyping();
      }
    }, TYPING_PING_MS);
  }, [clearTyping, pingTyping, senderId]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: ReactionEmoji) => {
      if (!senderId) {
        return;
      }

      if (reactionsTableSupported === false) {
        setNotice(
          "Reactions need supabase-features-migration.sql. Run it in Supabase, then refresh.",
        );
        return;
      }

      const existing = reactions.find(
        (reaction) =>
          reaction.message_id === messageId && reaction.user_id === senderId,
      );

      if (existing?.emoji === emoji) {
        setReactions((current) =>
          current.filter((reaction) => reaction.id !== existing.id),
        );

        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existing.id);

        if (error) {
          setReactions((current) => [...current, existing]);
          setNotice("Could not remove reaction. Try again.");
        }
        return;
      }

      const previous = existing ?? null;
      const optimistic: MessageReaction = {
        id: existing?.id ?? `optimistic-${messageId}-${senderId}`,
        message_id: messageId,
        user_id: senderId,
        emoji,
        created_at: existing?.created_at ?? new Date().toISOString(),
      };

      setReactions((current) => [
        ...current.filter(
          (reaction) =>
            !(reaction.message_id === messageId && reaction.user_id === senderId),
        ),
        optimistic,
      ]);

      const { data, error } = await supabase
        .from("message_reactions")
        .upsert(
          {
            message_id: messageId,
            user_id: senderId,
            emoji,
          },
          { onConflict: "message_id,user_id" },
        )
        .select("id, message_id, user_id, emoji, created_at")
        .single();

      if (error) {
        setReactions((current) => {
          const withoutOptimistic = current.filter(
            (reaction) => reaction.id !== optimistic.id,
          );
          return previous ? [...withoutOptimistic, previous] : withoutOptimistic;
        });

        if (error.code === "42P01" || error.message?.includes("message_reactions")) {
          reactionsTableSupported = false;
          setNotice(
            "Reactions need supabase-features-migration.sql. Run it in Supabase, then refresh.",
          );
        } else {
          setNotice("Could not save reaction. Try again.");
        }
        return;
      }

      reactionsTableSupported = true;
      if (data) {
        setReactions((current) => [
          ...current.filter(
            (reaction) =>
              !(
                reaction.message_id === messageId && reaction.user_id === senderId
              ),
          ),
          data as MessageReaction,
        ]);
      }
    },
    [reactions, senderId],
  );

  const markMessagesRead = useCallback(
    async (nextMessages: Message[]) => {
      if (!senderId || document.visibilityState !== "visible") {
        return;
      }

      const unreadIds = nextMessages
        .filter((message) => message.sender_id !== senderId && !message.read_at)
        .map((message) => message.id);

      if (!unreadIds.length) {
        return;
      }

      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
    },
    [senderId],
  );

  useEffect(() => {
    const storedUser = getStoredUser();

    if (storedUser) {
      setSenderId(storedUser);
      setSenderName(storedUser);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    senderIdRef.current = senderId;
  }, [senderId]);

  useEffect(() => {
    if (!senderId) {
      return;
    }

    void ensurePushSubscription(senderId);
  }, [senderId]);

  useEffect(() => {
    if (firstUnreadIncomingId) {
      if (unreadDismissTimerRef.current !== null) {
        window.clearTimeout(unreadDismissTimerRef.current);
        unreadDismissTimerRef.current = null;
      }
      setActiveUnreadMarkerId(firstUnreadIncomingId);
      return;
    }

    if (!activeUnreadMarkerId) {
      return;
    }

    if (unreadDismissTimerRef.current !== null) {
      window.clearTimeout(unreadDismissTimerRef.current);
    }

    unreadDismissTimerRef.current = window.setTimeout(() => {
      setActiveUnreadMarkerId(null);
      unreadDismissTimerRef.current = null;
    }, UNREAD_DISMISS_MS);
  }, [activeUnreadMarkerId, firstUnreadIncomingId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreMessagesRef.current = hasMoreMessages;
  }, [hasMoreMessages]);

  useEffect(() => {
    if (!senderId) {
      return;
    }

    let isMounted = true;

    async function loadInitialData() {
      setIsLoading(true);
      lastSeenLatestMessageIdRef.current = null;
      hasCompletedInitialScrollRef.current = false;
      stickToBottomRef.current = true;
      isViewingHistoryRef.current = false;
      await Promise.all([
        fetchMessages({ fullHistory: true }),
        fetchPresences(),
        updatePresence(),
      ]);
      void fetchReactions();
      if (isMounted) {
        setIsLoading(false);
      }
    }

    void loadInitialData();

    const messagesChannel = supabase
      .channel("private-chat-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const inserted = normalizeMessage(payload.new as Message);
            setMessages((current) =>
              mergeMessagesById(
                current.filter((message) => message.id !== inserted.id),
                [inserted],
              ),
            );
          }

          if (payload.eventType === "UPDATE") {
            const updated = normalizeMessage(payload.new as Message);
            setMessages((current) => {
              const next = mergeMessagesById(
                current.filter((message) => message.id !== updated.id),
                [updated],
              );
              return messagesAreEqual(current, next) ? current : next;
            });
          }
        },
      )
      .subscribe();

    const presenceChannel = supabase
      .channel("private-chat-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_presence" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            void fetchPresences();
            return;
          }

          const row = payload.new as Presence;
          if (!row?.session_id) {
            return;
          }

          if (row.session_id === senderIdRef.current) {
            return;
          }

          setPresences((current) => applyPresenceUpdate(current, row));
        },
      )
      .subscribe();

    const reactionsChannel = supabase
      .channel("private-chat-reactions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const inserted = payload.new as MessageReaction;
            setReactions((current) => [
              ...current.filter(
                (reaction) =>
                  !(
                    reaction.message_id === inserted.message_id &&
                    reaction.user_id === inserted.user_id
                  ),
              ),
              inserted,
            ]);
          }

          if (payload.eventType === "UPDATE") {
            const updated = payload.new as MessageReaction;
            setReactions((current) =>
              current.map((reaction) =>
                reaction.id === updated.id ? updated : reaction,
              ),
            );
          }

          if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setReactions((current) =>
              current.filter((reaction) => reaction.id !== deleted.id),
            );
          }
        },
      )
      .subscribe();

    const pollingTimer = window.setInterval(() => {
      void fetchPresences();
    }, 7000);

    const presenceTimer = window.setInterval(() => {
      void updatePresence();
    }, 20000);

    const handleVisibility = () => {
      void updatePresence();
      void fetchMessages();
      void markMessagesRead(messagesRef.current);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      isMounted = false;
      window.clearInterval(pollingTimer);
      window.clearInterval(presenceTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      void supabase.removeChannel(messagesChannel);
      void supabase.removeChannel(presenceChannel);
      void supabase.removeChannel(reactionsChannel);
    };
  }, [
    fetchMessages,
    fetchPresences,
    fetchReactions,
    markMessagesRead,
    senderId,
    updatePresence,
  ]);

  useEffect(() => {
    if (!latestOtherPresence?.is_typing) {
      return;
    }

    const timer = window.setInterval(() => {
      setStatusTick((tick) => tick + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [latestOtherPresence?.is_typing, latestOtherPresence?.session_id]);

  useEffect(() => {
    if (!reactionPickerId) {
      return;
    }

    const closePicker = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".reaction-picker")
      ) {
        return;
      }
      setReactionPickerId(null);
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", closePicker);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", closePicker);
    };
  }, [reactionPickerId]);

  useEffect(() => {
    void fetchReactions();
  }, [fetchReactions, senderId]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (typingPingTimerRef.current !== null) {
        window.clearTimeout(typingPingTimerRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (unreadDismissTimerRef.current !== null) {
        window.clearTimeout(unreadDismissTimerRef.current);
      }
      void clearTyping();
    };
  }, [clearTyping]);

  useEffect(() => {
    void markMessagesRead(messages);
  }, [markMessagesRead, messages]);

  useLayoutEffect(() => {
    if (!isMounted || isLoading) {
      return;
    }

    const container = messageListRef.current;
    if (!container || !messages.length) {
      return;
    }

    if (pendingScrollRestoreRef.current) {
      const { scrollHeight, scrollTop } = pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
      isPrependingOlderRef.current = false;

      const heightDelta = container.scrollHeight - scrollHeight;
      container.scrollTop = scrollTop + heightDelta;
      return;
    }

    if (isJumpingToMessageRef.current) {
      isJumpingToMessageRef.current = false;
      isPrependingOlderRef.current = false;
      return;
    }

    if (isPrependingOlderRef.current) {
      isPrependingOlderRef.current = false;
      return;
    }

    const latestMessage = messages[messages.length - 1];
    const latestMessageId = latestMessage?.id ?? null;
    const hasNewLatestMessage =
      latestMessageId !== null &&
      latestMessageId !== lastSeenLatestMessageIdRef.current;

    const shouldForceScroll = forceScrollOnNextUpdateRef.current;
    forceScrollOnNextUpdateRef.current = false;

    if (isViewingHistoryRef.current && !shouldForceScroll) {
      if (latestMessageId) {
        lastSeenLatestMessageIdRef.current = latestMessageId;
      }
      return;
    }

    lastSeenLatestMessageIdRef.current = latestMessageId;

    const shouldScroll =
      shouldForceScroll ||
      (!hasCompletedInitialScrollRef.current && messages.length > 0) ||
      (hasNewLatestMessage && stickToBottomRef.current);

    if (!shouldScroll) {
      return;
    }

    scheduleScrollToBottom(container);
    hasCompletedInitialScrollRef.current = true;
    stickToBottomRef.current = true;
    isViewingHistoryRef.current = false;
  }, [messages, isMounted, isLoading]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container || !isMounted) {
      return;
    }

    const handleScroll = () => {
      const nearBottom = isNearBottom(container);
      const wasViewingHistory = isViewingHistoryRef.current;
      stickToBottomRef.current = nearBottom;
      isViewingHistoryRef.current = !nearBottom;

      if (wasViewingHistory && nearBottom) {
        scheduleScrollToBottom(container);
      }
    };

    const handleMediaLoad = () => {
      if (
        stickToBottomRef.current &&
        !isViewingHistoryRef.current &&
        isNearBottom(container)
      ) {
        scheduleScrollToBottom(container);
      }
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("load", handleMediaLoad, true);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("load", handleMediaLoad, true);
    };
  }, [isMounted]);

  useEffect(() => {
    const container = messageListRef.current;
    const justFinishedLoading = wasLoadingRef.current && !isLoading;
    wasLoadingRef.current = isLoading;

    if (!container || !isMounted || !justFinishedLoading || !messages.length) {
      return;
    }

    stickToBottomRef.current = true;
    isViewingHistoryRef.current = false;
    scheduleScrollToBottom(container);
    hasCompletedInitialScrollRef.current = true;
  }, [isLoading, isMounted, messages.length]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || !isMounted) return;
    const observerOptions = {
      root: messageList,
      rootMargin: "100px",
      threshold: 0,
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && hasMoreMessages && !isLoadingOlder) {
          void fetchOlderMessages();
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);
    if (startRef.current) {
      observer.observe(startRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMoreMessages, isLoadingOlder, fetchOlderMessages, isMounted]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  function flashMessage(messageId: string) {
    setHighlightedMessageId(messageId);

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimerRef.current = null;
    }, REPLY_HIGHLIGHT_MS);
  }

  async function loadOlderBatchForJump() {
    const current = messagesRef.current;
    if (!current.length || !hasMoreMessagesRef.current) {
      return false;
    }

    const oldestTimestamp = current[0].created_at;
    const { data, error } = await queryMessages({
      before: oldestTimestamp,
      limit: MESSAGE_PAGE_SIZE,
    });

    if (error) {
      console.error("Error fetching older messages:", error);
      return false;
    }

    if (!data?.length) {
      setHasMoreMessages(false);
      hasMoreMessagesRef.current = false;
      return false;
    }

    isJumpingToMessageRef.current = true;
    isPrependingOlderRef.current = true;
    stickToBottomRef.current = false;
    isViewingHistoryRef.current = true;

    const merged = mergeMessagesById(data, current);
    messagesRef.current = merged;
    setMessages(merged);

    const hasMore = data.length === MESSAGE_PAGE_SIZE;
    setHasMoreMessages(hasMore);
    hasMoreMessagesRef.current = hasMore;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    return true;
  }

  function scrollToMessageElement(messageId: string) {
    const container = messageListRef.current;
    if (!container) {
      return false;
    }

    const target = container.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );

    if (!target) {
      return false;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    flashMessage(messageId);
    return true;
  }

  async function goToQuotedMessage(messageId: string) {
    if (messagesRef.current.some((message) => message.id === messageId)) {
      scrollToMessageElement(messageId);
      return;
    }

    let attempts = 0;
    while (
      !messagesRef.current.some((message) => message.id === messageId) &&
      hasMoreMessagesRef.current &&
      attempts < 20
    ) {
      const loaded = await loadOlderBatchForJump();
      if (!loaded) {
        break;
      }
      attempts += 1;
    }

    if (!messagesRef.current.some((message) => message.id === messageId)) {
      setNotice("Original message is no longer available.");
      return;
    }

    scrollToMessageElement(messageId);
  }

  function startReply(message: Message) {
    setReplyTo(toReplyTarget(message));
    flashMessage(message.id);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function handleMessageActivate(message: Message) {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    const now = Date.now();
    const lastTap = lastTapRef.current;

    if (lastTap?.id === message.id && now - lastTap.time <= DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      startReply(message);
      return;
    }

    lastTapRef.current = { id: message.id, time: now };
  }

  function clearReply() {
    setReplyTo(null);
  }

  function handleBubblePointerDown(message: Message) {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setReactionPickerId(message.id);
    }, LONG_PRESS_MS);
  }

  function handleBubblePointerUp() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleTextChange(value: string) {
    draftTextRef.current = value;
    const nextHasDraft = value.trim().length > 0;
    setHasDraftText((current) => (current === nextHasDraft ? current : nextHasDraft));

    if (value.trim()) {
      queueTypingSignal();
    } else {
      void clearTyping();
    }
  }

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  function handleSelectUser(user: ChatUser) {
    window.sessionStorage.setItem(CHAT_USER_STORAGE_KEY, user);
    window.localStorage.removeItem("private-chat-sender-id");
    window.localStorage.removeItem("private-chat-sender-name");
    setMessages([]);
    setHasMoreMessages(false);
    setReplyTo(null);
    setReactions([]);
    setReactionPickerId(null);
    draftTextRef.current = "";
    setHasDraftText(false);
    setSenderId(user);
    setSenderName(user);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!isUploadableMedia(file)) {
      setNotice("Only image and video files can be sent.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setNotice("Please choose a file smaller than 50 MB.");
      event.target.value = "";
      return;
    }

    setNotice("");
    setSelectedFile(file);
  }

  async function uploadSelectedFile(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "media";
    const filePath = `${senderId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(filePath);

    return {
      mediaPath: filePath,
      mediaUrl: data.publicUrl,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
    } as const;
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draftTextRef.current.trim();
    if (!body && !selectedFile) {
      return;
    }

    setIsSending(true);
    setNotice("");

    try {
      let media:
        | {
            mediaPath: string;
            mediaUrl: string;
            mediaType: MediaType;
          }
        | undefined;

      if (selectedFile) {
        media = await uploadSelectedFile(selectedFile);
      }

      const payload = {
        body: body || null,
        media_url: media?.mediaUrl ?? null,
        media_path: media?.mediaPath ?? null,
        media_type: media?.mediaType ?? null,
        sender_id: senderId,
        sender_name: senderName,
        reply_to_id: replyTo?.id ?? null,
        reply_to_sender_name: replyTo?.sender_name ?? null,
        reply_to_body: replyTo ? getMessagePreview(replyTo) : null,
        reply_to_media_type: replyTo?.media_type ?? null,
      };

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Could not send message");
      }

      forceScrollOnNextUpdateRef.current = true;
      stickToBottomRef.current = true;
      isViewingHistoryRef.current = false;

      draftTextRef.current = "";
      setHasDraftText(false);
      setSelectedFile(null);
      setReplyTo(null);
      void clearTyping();
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await updatePresence();
    } catch {
      setNotice("Message could not be sent. Check the Supabase setup.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleLogout() {
    window.sessionStorage.removeItem(CHAT_USER_STORAGE_KEY);
    window.localStorage.removeItem("private-chat-sender-id");
    window.localStorage.removeItem("private-chat-sender-name");
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (!senderId || !senderName) {
    return (
      <main className="gate-screen">
        <section className="gate-panel" aria-labelledby="identity-title">
          <div className="gate-badge" aria-hidden="true">
            <SmilePlus size={22} strokeWidth={2.2} />
          </div>
          <div className="gate-copy">
            <p className="eyebrow">Private Room</p>
            <h1 id="identity-title">Choose your name</h1>
          </div>

          <div className="user-choice">
            <div className="choice-grid">
              {CHAT_USERS.map((user) => (
                <button
                  className="choice-button"
                  key={user}
                  onClick={() => handleSelectUser(user)}
                  type="button"
                >
                  {user}
                </button>
              ))}
            </div>
          </div>

          <button className="ghost-button lock-choice" onClick={handleLogout} type="button">
            <LogOut size={17} aria-hidden="true" />
            Lock room
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-screen">
      <section className="chat-panel" aria-label="Chat conversation">
        <header className="chat-header">
          <div className="contact-summary">
            <div className="contact-avatar" aria-hidden="true">
              <UserRound size={21} />
            </div>
            <div className="contact-copy">
              <h1>{contactName}</h1>
              <p className={contactStatus === "typing..." ? "is-typing" : undefined}>
                {contactStatus}
              </p>
            </div>
          </div>
          <div className="header-actions">
            <span className="self-chip">as {senderName}</span>
            <button
              aria-label="Lock room"
              className="icon-button header-lock"
              onClick={handleLogout}
              title="Lock room"
              type="button"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {notice ? <div className="notice-banner">{notice}</div> : null}

        <div
          className="message-list"
          aria-live="polite"
          ref={messageListRef}
          suppressHydrationWarning
        >
          <div ref={startRef} />
          {isLoadingOlder && (
            <div className="loading-older">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              <span>Loading older messages...</span>
            </div>
          )}
          {isLoading ? (
            <div className="empty-state">
              <Loader2 className="spin" size={22} aria-hidden="true" />
              Loading chat
            </div>
          ) : messages.length ? (
            messageTimeline.map((item) => {
              if (item.type === "date") {
                return (
                  <div className="date-separator" key={item.key}>
                    <span>{item.label}</span>
                  </div>
                );
              }

              const message = item.message;
              const isMine = message.sender_id === senderId;
              const isEmojiOnly = isSingleEmojiMessage(message);
              const messageReactions = reactionsByMessageId.get(message.id) ?? [];
              const reactionGroups = groupReactions(messageReactions);
              const isUnreadHighlight =
                !isMine &&
                ((firstUnreadIncomingId !== null && !message.read_at) ||
                  (firstUnreadIncomingId === null &&
                    unreadAnchorTimestamp !== null &&
                    new Date(message.created_at).getTime() >= unreadAnchorTimestamp));
              const messageMeta = (
                <span className="message-meta">
                  <time dateTime={message.created_at}>
                    {formatMessageTime(message.created_at)}
                  </time>
                  {isMine ? (
                    <span
                      className={`read-state ${
                        message.read_at ? "is-read" : "is-unread"
                      }`}
                      title={
                        message.read_at
                          ? `Read ${formatFullDateTime(message.read_at)}`
                          : "Unread"
                      }
                    >
                      {message.read_at ? (
                        <CheckCheck size={15} aria-hidden="true" />
                      ) : (
                        <Check size={15} aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {message.read_at ? "Read" : "Unread"}
                      </span>
                    </span>
                  ) : null}
                </span>
              );

              return (
                <Fragment key={message.id}>
                  {activeUnreadMarkerId === message.id ? (
                    <div className="unread-separator">
                      <span>Unread messages</span>
                    </div>
                  ) : null}
                  <article
                    className={`message-row ${isMine ? "is-mine" : "is-theirs"} ${
                      isEmojiOnly ? "is-single-emoji" : ""
                    } ${
                      highlightedMessageId === message.id ? "is-reply-highlight" : ""
                    } ${reactionGroups.length ? "has-reactions" : ""} ${
                      isUnreadHighlight ? "is-unread-highlight" : ""
                    }`}
                    data-message-id={message.id}
                  >
                    <div className="message-stack">
                    {reactionPickerId === message.id ? (
                      <div
                        className={`reaction-picker ${
                          isMine ? "is-mine" : "is-theirs"
                        }`}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            aria-label={`React with ${emoji}`}
                            className="reaction-picker-button"
                            key={emoji}
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleReaction(message.id, emoji);
                              setReactionPickerId(null);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            type="button"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div
                      className={`message-bubble ${
                        isEmojiOnly ? "message-emoji-only" : ""
                      }`}
                      onDoubleClick={() => startReply(message)}
                      onPointerDown={() => handleBubblePointerDown(message)}
                      onPointerLeave={handleBubblePointerUp}
                      onPointerUp={handleBubblePointerUp}
                      onTouchEnd={() => handleMessageActivate(message)}
                    >
                    {!isMine && !isEmojiOnly ? (
                      <div className="sender-name">{message.sender_name}</div>
                    ) : null}

                    {message.reply_to_id && message.reply_to_sender_name ? (
                      <button
                        aria-label={`Go to message from ${message.reply_to_sender_name}`}
                        className={`reply-quote ${
                          message.reply_to_sender_name === senderName
                            ? "is-self"
                            : "is-contact"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void goToQuotedMessage(message.reply_to_id!);
                        }}
                        onTouchEnd={(event) => {
                          event.stopPropagation();
                        }}
                        type="button"
                      >
                        <span className="reply-quote-name">
                          {message.reply_to_sender_name}
                        </span>
                        <span className="reply-quote-text">
                          {message.reply_to_body ??
                            (message.reply_to_media_type === "image"
                              ? "Photo"
                              : message.reply_to_media_type === "video"
                                ? "Video"
                                : "Message")}
                        </span>
                      </button>
                    ) : null}

                    {message.media_url && message.media_type ? (
                      <button
                        aria-label={`View ${message.media_type}`}
                        className="message-attachment"
                        onClick={() =>
                          setActiveMedia({
                            url: message.media_url!,
                            type: message.media_type!,
                            alt: message.body ?? `Shared ${message.media_type}`,
                          })
                        }
                        type="button"
                      >
                        <div className="message-attachment-thumb">
                          {message.media_type === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              src={message.media_url}
                            />
                          ) : (
                            <video
                              muted
                              playsInline
                              preload="metadata"
                              src={message.media_url}
                            />
                          )}
                        </div>
                        <span className="message-attachment-label">
                          {message.media_type === "image" ? "Image" : "Video"}
                        </span>
                      </button>
                    ) : null}

                    {message.body ? (
                      isEmojiOnly ? (
                        <div className="message-emoji-only-content">
                          <span className="message-emoji-large">
                            {message.body.trim()}
                          </span>
                          <div className="message-emoji-meta">{messageMeta}</div>
                        </div>
                      ) : (
                        <div className="message-text">
                          <MessageBody text={message.body} />
                          {messageMeta}
                        </div>
                      )
                    ) : (
                      <div className="message-meta-line">{messageMeta}</div>
                    )}
                    </div>

                    {reactionGroups.length ? (
                      <div
                        className={`message-reactions ${
                          isMine ? "is-mine" : "is-theirs"
                        }`}
                      >
                        {reactionGroups.map((group) => (
                          <button
                            className={`reaction-chip ${
                              group.users.includes(senderId) ? "is-mine" : ""
                            }`}
                            key={group.emoji}
                            onClick={() =>
                              void toggleReaction(message.id, group.emoji)
                            }
                            type="button"
                          >
                            <span aria-hidden="true">{group.emoji}</span>
                            {group.users.length > 1 ? (
                              <span className="reaction-count">
                                {group.users.length}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    </div>
                  </article>
                </Fragment>
              );
            })
          ) : (
            <div className="empty-state">No messages yet</div>
          )}
          <div ref={endRef} />
        </div>

        {selectedFile ? (
          <div className="attachment-preview">
            <div className="preview-thumb">
              {selectedFile.type.startsWith("image/") && previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={selectedFile.name} src={previewUrl} />
              ) : previewUrl ? (
                <video src={previewUrl} muted />
              ) : (
                <Video size={24} aria-hidden="true" />
              )}
            </div>
            <div className="preview-copy">
              <strong>{selectedFile.name}</strong>
              <span>{Math.ceil(selectedFile.size / 1024)} KB</span>
            </div>
            <button
              aria-label="Remove attachment"
              className="icon-button"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}

        {replyTo ? (
          <div className="reply-preview">
            <div
              className={`reply-preview-bar ${
                replyTo.sender_name === senderName ? "is-self" : "is-contact"
              }`}
            />
            <div className="reply-preview-copy">
              <strong>{replyTo.sender_name}</strong>
              <span>{getMessagePreview(replyTo)}</span>
            </div>
            <button
              aria-label="Cancel reply"
              className="icon-button reply-preview-dismiss"
              onClick={clearReply}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}

        <form className="composer" onSubmit={handleSend}>
          <input
            ref={fileInputRef}
            accept="image/*,video/*"
            className="file-input"
            onChange={handleFileChange}
            type="file"
          />
          <button
            aria-label="Attach image or video"
            className="icon-button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image or video"
            type="button"
          >
            <ImagePlus size={20} />
          </button>
          <textarea
            aria-label="Message"
            onChange={(event) => handleTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && replyTo) {
                event.preventDefault();
                clearReply();
                return;
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={replyTo ? "Reply..." : "Write a message"}
            ref={textareaRef}
            rows={1}
          />
          <button
            aria-label="Send message"
            className="send-button"
            disabled={isSending || (!hasDraftText && !selectedFile)}
            title="Send message"
            type="submit"
          >
            {isSending ? (
              <Loader2 className="spin" size={20} aria-hidden="true" />
            ) : (
              <Send size={20} aria-hidden="true" />
            )}
          </button>
        </form>

        {activeMedia ? (
          <MediaViewer
            alt={activeMedia.alt}
            onClose={() => setActiveMedia(null)}
            type={activeMedia.type}
            url={activeMedia.url}
          />
        ) : null}
      </section>
    </main>
  );
}
