"use client";

import {
  ChangeEvent,
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
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const CHAT_USERS = ["bubu", "buggu"] as const;
const CHAT_USER_STORAGE_KEY = "private-chat-user";
const DOUBLE_TAP_MS = 320;
const REPLY_HIGHLIGHT_MS = 900;

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

function getContactStatus(presence?: Presence) {
  if (!presence) {
    return "last seen not available yet";
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

const MESSAGE_SELECT =
  "id, body, media_url, media_path, media_type, sender_id, sender_name, created_at, read_at, reply_to_id, reply_to_sender_name, reply_to_body, reply_to_media_type";

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
  const [text, setText] = useState("");
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
    [latestOtherPresence],
  );

  const fetchMessages = useCallback(async () => {
    const { data, error, count } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT, { count: "exact" })
      .in("sender_id", [...CHAT_USERS])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setNotice(
        "Supabase is not ready yet. Run the SQL in supabase-setup.sql, then refresh.",
      );
      return;
    }

    const fetched = sortMessages((data ?? []) as Message[]);

    setMessages((current) => {
      if (!current.length) {
        return fetched;
      }

      const fetchedById = new Map(
        fetched.map((message) => [message.id, message]),
      );
      const currentIds = new Set(current.map((message) => message.id));
      const updatedCurrent = current.map(
        (message) => fetchedById.get(message.id) ?? message,
      );
      const brandNew = fetched.filter((message) => !currentIds.has(message.id));
      const merged = sortMessages([...updatedCurrent, ...brandNew]);

      return messagesAreEqual(current, merged) ? current : merged;
    });
    setHasMoreMessages((count ?? 0) > 50);
    setNotice("");
  }, []);

  const fetchOlderMessages = useCallback(async () => {
    if (!messages.length || isLoadingOlder) {
      return;
    }

    setIsLoadingOlder(true);
    const oldestMessage = messages[0];
    const oldestTimestamp = oldestMessage.created_at;

    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .in("sender_id", [...CHAT_USERS])
      .lt("created_at", oldestTimestamp)
      .order("created_at", { ascending: true })
      .limit(50);

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

      setMessages((current) =>
        sortMessages([...(data as Message[]), ...current])
      );
      setHasMoreMessages(data.length === 50);
    } else {
      setHasMoreMessages(false);
    }

    setIsLoadingOlder(false);
  }, [messages, isLoadingOlder]);

  const fetchPresences = useCallback(async () => {
    const { data } = await supabase
      .from("chat_presence")
      .select("session_id, display_name, last_seen")
      .in("session_id", [...CHAT_USERS])
      .order("last_seen", { ascending: false })
      .limit(20);

    setPresences((data ?? []) as Presence[]);
  }, []);

  const updatePresence = useCallback(
    async () => {
      if (!senderId || !senderName) {
        return;
      }

      await supabase.from("chat_presence").upsert({
        session_id: senderId,
        display_name: senderName,
        last_seen: new Date().toISOString(),
      });
    },
    [senderId, senderName],
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
      await Promise.all([fetchMessages(), fetchPresences(), updatePresence()]);
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
            setMessages((current) =>
              sortMessages([
                ...current.filter(
                  (message) => message.id !== (payload.new as Message).id,
                ),
                payload.new as Message,
              ]),
            );
          }

          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Message;
            setMessages((current) => {
              const next = sortMessages(
                current.map((message) =>
                  message.id === updated.id ? updated : message,
                ),
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
        () => {
          void fetchPresences();
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
    };
  }, [
    fetchMessages,
    fetchPresences,
    markMessagesRead,
    senderId,
    updatePresence,
  ]);

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
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .in("sender_id", [...CHAT_USERS])
      .lt("created_at", oldestTimestamp)
      .order("created_at", { ascending: true })
      .limit(50);

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

    const merged = sortMessages([...(data as Message[]), ...current]);
    messagesRef.current = merged;
    setMessages(merged);

    const hasMore = data.length === 50;
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

    const body = text.trim();
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

      const { error } = await supabase.from("messages").insert({
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
      });

      if (error) {
        throw error;
      }

      forceScrollOnNextUpdateRef.current = true;
      stickToBottomRef.current = true;
      isViewingHistoryRef.current = false;

      setText("");
      setSelectedFile(null);
      setReplyTo(null);
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
              <p>{contactStatus}</p>
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
            messages.map((message) => {
              const isMine = message.sender_id === senderId;
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
                <article
                  className={`message-row ${isMine ? "is-mine" : "is-theirs"} ${
                    highlightedMessageId === message.id ? "is-reply-highlight" : ""
                  }`}
                  data-message-id={message.id}
                  key={message.id}
                >
                  <div
                    className="message-bubble"
                    onDoubleClick={() => startReply(message)}
                    onTouchEnd={() => handleMessageActivate(message)}
                  >
                    {!isMine ? (
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
                      <p className="message-text">
                        <span className="message-copy">{message.body}</span>
                        {messageMeta}
                      </p>
                    ) : (
                      <div className="message-meta-line">{messageMeta}</div>
                    )}
                  </div>
                </article>
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
            onChange={(event) => setText(event.target.value)}
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
            value={text}
          />
          <button
            aria-label="Send message"
            className="send-button"
            disabled={isSending || (!text.trim() && !selectedFile)}
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
