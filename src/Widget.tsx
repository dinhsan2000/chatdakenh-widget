import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { Message, WidgetConfig, WidgetSettings } from "./types";
import logoSvg from "./assets/logo.svg";
import { t } from "./i18n";
import { api } from "./api";
import { widgetSocket } from "./socket";
import {
  storage,
  generateVisitorId,
  getBrowserInfo,
  getPageInfo,
} from "./storage";
import { EmojiPicker } from "./EmojiPicker";
import "./styles.css";

interface WidgetProps {
  widgetId: string;
  apiUrl: string;
  wsUrl: string;
}

const Widget: FunctionComponent<WidgetProps> = ({
  widgetId,
  apiUrl,
  wsUrl,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [failedMsgIds, setFailedMsgIds] = useState<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const agentTypingTimeoutRef = useRef<number | null>(null);

  const settings = config?.settings;
  const isCompactBubble = config?.settings?.widget_bubble_type === "compact";
  const launcherLogoSrc = logoSvg;

  const normalizeDayKey = useCallback((rawDay: string) => {
    const normalized = (rawDay || "").trim().toLowerCase();
    const aliases: Record<string, string> = {
      mon: "monday",
      tue: "tuesday",
      tues: "tuesday",
      wed: "wednesday",
      thu: "thursday",
      thur: "thursday",
      thurs: "thursday",
      fri: "friday",
      sat: "saturday",
      sun: "sunday",
      "thứ 2": "monday",
      "thu 2": "monday",
      "thứ 3": "tuesday",
      "thu 3": "tuesday",
      "thứ 4": "wednesday",
      "thu 4": "wednesday",
      "thứ 5": "thursday",
      "thu 5": "thursday",
      "thứ 6": "friday",
      "thu 6": "friday",
      "thứ 7": "saturday",
      "thu 7": "saturday",
      "chủ nhật": "sunday",
      "chu nhat": "sunday",
    };
    return aliases[normalized] || normalized;
  }, []);

  // ============= Initialize =============
  useEffect(() => {
    if (initRef.current || !widgetId) return;
    initRef.current = true;

    api.configure(apiUrl);
    widgetSocket.configure(wsUrl);

    const init = async () => {
      try {
        let visitorId = storage.getVisitorId();
        if (!visitorId) {
          visitorId = generateVisitorId();
          storage.setVisitorId(visitorId);
        }

        const data = await api.initialize({
          widget_id: widgetId,
          visitor_id: visitorId,
          page_info: getPageInfo(),
          browser_info: getBrowserInfo(),
        });
        storage.setSessionToken(data.session_token);
        storage.setTenantId(data.tenant_id);
        storage.setConversationId(data.conversation_id);

        setConfig(data.widget_config);
        setIsInitialized(true);

        // Auto open
        if (data.widget_config.settings?.autoOpen) {
          setTimeout(() => setIsOpen(true), 2000);
        }

        // Connect socket AFTER we have session_token
        widgetSocket.connect();

        // Load existing messages
        try {
          const msgs = await api.getMessages(widgetId, data.conversation_id);
          setMessages(msgs);
        } catch {
          /* no messages yet */
        }
      } catch {
        // Init failed silently
      }
    };

    init();

    return () => {
      widgetSocket.disconnect();
    };
  }, [widgetId, apiUrl, wsUrl]);

  // ============= Socket listeners =============
  useEffect(() => {
    if (!isInitialized) return;

    const unsubMessage = widgetSocket.onMessage((message) => {
      setMessages((prev) => [...prev, message]);
      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }

      // Message received — agent has stopped typing
      setAgentTyping(false);
      if (agentTypingTimeoutRef.current) {
        window.clearTimeout(agentTypingTimeoutRef.current);
        agentTypingTimeoutRef.current = null;
      }
    });

    const unsubTyping = widgetSocket.onTyping((data: any) => {
      // Ignored own typing events broadcasted by server
      if (data?.isWidget) return;

      setAgentTyping(data.isTyping);

      // Clear existing timeout
      if (agentTypingTimeoutRef.current) {
        window.clearTimeout(agentTypingTimeoutRef.current);
        agentTypingTimeoutRef.current = null;
      }

      // Auto-clear typing indicator after 3s (fallback if stop event is lost)
      if (data.isTyping) {
        agentTypingTimeoutRef.current = window.setTimeout(() => {
          setAgentTyping(false);
          agentTypingTimeoutRef.current = null;
        }, 3000);
      }
    });

    return () => {
      unsubMessage();
      unsubTyping();
    };
  }, [isInitialized, isOpen]);

  // ============= Auto scroll =============
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentTyping]);

  // ============= Focus input when open =============
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // ============= Send message =============
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setInputText("");

    // Clear typing indicator when message is sent
    const conversationIdForTyping = storage.getConversationId();
    if (conversationIdForTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      widgetSocket.emitTyping(conversationIdForTyping, false);
    }

    // Optimistic: add message locally
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      content: text,
      sender_type: "contact",
      message_type: "incoming",
      sent_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const isOutsideBusinessHours = (() => {
      if (!settings?.enable_business_hours || !settings?.business_hours) {
        return false;
      }

      const getBusinessNowForSend = () => {
        const tz = settings?.timezone;
        if (!tz) return new Date();

        try {
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            weekday: "long",
          });
          const parts = formatter.formatToParts(new Date());
          const get = (type: string) =>
            parts.find((p) => p.type === type)?.value || "";
          return {
            day: get("weekday"),
            hours: parseInt(get("hour")),
            minutes: parseInt(get("minute")),
          };
        } catch {
          const now = new Date();
          const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ];
          return {
            day: dayNames[now.getDay()],
            hours: now.getHours(),
            minutes: now.getMinutes(),
          };
        }
      };

      const bizNow = getBusinessNowForSend();
      const currentDay =
        typeof bizNow === "object" && "day" in bizNow
          ? normalizeDayKey(bizNow.day)
          : "";

      const todaySchedule = settings.business_hours.find(
        (h: any) => normalizeDayKey(h.day) === currentDay,
      );
      if (!todaySchedule || !todaySchedule.enabled) return true;

      const currentTime =
        (typeof bizNow === "object" && "hours" in bizNow ? bizNow.hours : 0) *
        60 +
        (typeof bizNow === "object" && "minutes" in bizNow
          ? bizNow.minutes
          : 0);
      const [startHour, startMin] = todaySchedule.startTime.split(":").map(Number);
      const [endHour, endMin] = todaySchedule.endTime.split(":").map(Number);
      const startTimeInMinutes = startHour * 60 + (startMin || 0);
      const endTimeInMinutes = endHour * 60 + (endMin || 0);

      return currentTime < startTimeInMinutes || currentTime > endTimeInMinutes;
    })();

    if (isOutsideBusinessHours) {
      const offlineReply: Message = {
        id: `offline_${Date.now()}`,
        content:
          settings?.offlineMessage ||
          t("offlineMessage"),
        sender_type: "user",
        message_type: "outgoing",
        sent_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, offlineReply]);
      setIsSending(false);
      return;
    }

    try {
      const conversationId = storage.getConversationId() || "";
      const visitorId = storage.getVisitorId() || "";

      const response = await api.sendMessage({
        conversation_id: conversationId,
        widget_id: widgetId,
        visitor_id: visitorId,
        sender_name: visitorId,
        message: text,
        message_type: "text",
      });

      // Update conversation ID if new
      const newConvId =
        response.data?.conversation_id || response.data?.conversation?.id;
      if (newConvId) {
        storage.setConversationId(newConvId);
        // Join socket room for this conversation
        widgetSocket.joinConversation(newConvId);
      }

      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
              id: response.data?.id || tempId,
              content: response.data?.content || text,
              sender_type: "contact",
              message_type: "incoming",
              attachments: response.data?.attachments,
              sent_at: response.data?.sent_at || optimisticMsg.sent_at,
            }
            : m,
        ),
      );
    } catch {
      setFailedMsgIds((prev) => new Set(prev).add(tempId));
      showError(t("sendFailedToast"));
    } finally {
      setIsSending(false);
      // Ensure input maintains focus after sending
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  }, [inputText, isSending, widgetId, settings]);

  // ============= Show error toast =============
  const showError = useCallback((msg: string) => {
    setErrorToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setErrorToast(null);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  // ============= Retry failed message =============
  const handleRetry = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;

    // Remove from failed set
    setFailedMsgIds((prev) => {
      const next = new Set(prev);
      next.delete(msgId);
      return next;
    });

    try {
      const conversationId = storage.getConversationId() || "";
      const visitorId = storage.getVisitorId() || "";

      const response = await api.sendMessage({
        conversation_id: conversationId,
        widget_id: widgetId,
        visitor_id: visitorId,
        sender_name: visitorId,
        message: msg.content,
        message_type: msg.content_type || "text",
      });

      const newConvId = response.data?.conversation_id || response.data?.conversation?.id;
      if (newConvId) {
        storage.setConversationId(newConvId);
        widgetSocket.joinConversation(newConvId);
      }

      // Replace with real message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
              id: response.data?.id || msgId,
              content: response.data?.content || msg.content,
              sender_type: "contact",
              message_type: "incoming",
              attachments: response.data?.attachments,
              sent_at: response.data?.sent_at || msg.sent_at,
            }
            : m,
        ),
      );
    } catch {
      setFailedMsgIds((prev) => new Set(prev).add(msgId));
      showError(t("retryFailed"));
    }
  }, [messages, widgetId, showError]);

  // ============= Key handlers =============
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ============= Input helpers =============
  const appendEmoji = useCallback(
    (emoji: string) => {
      if (inputRef.current) {
        const start = inputRef.current.selectionStart;
        const end = inputRef.current.selectionEnd;
        const text = inputText;
        const newText = text.substring(0, start) + emoji + text.substring(end);
        setInputText(newText);

        // Focus and reset cursor after render
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            const newPos = start + emoji.length;
            inputRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      } else {
        setInputText((prev) => prev + emoji);
      }
    },
    [inputText],
  );

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = useCallback(async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const file = target.files[0];
    target.value = ""; // reset immediately

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      alert(t("fileTooLarge", { size: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }

    // Optimistic: show uploading indicator
    const tempId = `upload_${Date.now()}`;
    const isImage = file.type.startsWith("image/");
    const optimisticMsg: Message = {
      id: tempId,
      content: isImage ? "" : `📎 ${t("uploading", { name: file.name })}`,
      sender_type: "contact",
      message_type: "incoming",
      sent_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // 1. Upload file
      const uploaded = await api.uploadFile(file);

      // 2. Send message with attachment
      const conversationId = storage.getConversationId() || "";
      const visitorId = storage.getVisitorId() || "";

      const response = await api.sendMessage({
        conversation_id: conversationId,
        widget_id: widgetId,
        visitor_id: visitorId,
        sender_name: visitorId,
        message: isImage ? "" : `📎 ${file.name}`,
        message_type: isImage ? "image" : "file",
        attachments: [uploaded.url],
      });

      // Update conversation ID if new
      const newConvId = response.data?.conversation_id || response.data?.conversation?.id;
      if (newConvId) {
        storage.setConversationId(newConvId);
        widgetSocket.joinConversation(newConvId);
      }

      // Replace optimistic message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
              id: response.data?.id || tempId,
              content: response.data?.content || (isImage ? "" : `📎 ${file.name}`),
              sender_type: "contact",
              message_type: "incoming",
              attachments: [{ id: tempId, name: file.name, size: file.size, type: file.type, url: uploaded.url }],
              sent_at: response.data?.sent_at || optimisticMsg.sent_at,
            }
            : m,
        ),
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert(t("uploadFailed", { error: (err as Error).message }));
    } finally {
      // Ensure input maintains focus after sending
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  }, [widgetId]);

  const toggleWidget = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setUnreadCount(0);
      setShowEmoji(false);
    }
  };

  // ============= Render helpers =============
  /**
   * Get current time in the business timezone.
   * Supports IANA names (Asia/Ho_Chi_Minh) and UTC offset strings (UTC+7).
   */
  const getBusinessNow = useCallback(() => {
    const tz = settings?.timezone;
    if (!tz) return new Date();

    try {
      // Try IANA timezone first (e.g. 'Asia/Ho_Chi_Minh')
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        weekday: 'long',
      });
      const parts = formatter.formatToParts(new Date());
      const get = (type: string) => parts.find(p => p.type === type)?.value || '';
      return {
        day: get('weekday'),
        hours: parseInt(get('hour')),
        minutes: parseInt(get('minute')),
      };
    } catch {
      // Fallback: parse 'UTC+7' or 'UTC-5' format
      const match = tz.match(/UTC([+-])(\d{1,2})/i);
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        const offsetHours = parseInt(match[2]);
        const utcNow = new Date();
        const bizTime = new Date(utcNow.getTime() + sign * offsetHours * 60 * 60 * 1000);
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return {
          day: dayNames[bizTime.getUTCDay()],
          hours: bizTime.getUTCHours(),
          minutes: bizTime.getUTCMinutes(),
        };
      }
      // Last resort: visitor local time
      const now = new Date();
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return { day: dayNames[now.getDay()], hours: now.getHours(), minutes: now.getMinutes() };
    }
  }, [settings?.timezone]);

  const isOnline = useMemo(() => {
    if (!settings?.enable_business_hours || !settings?.business_hours)
      return true;

    const bizNow = getBusinessNow();
    const currentDay =
      typeof bizNow === "object" && "day" in bizNow
        ? normalizeDayKey(bizNow.day)
        : "";

    const todaySchedule = settings.business_hours.find(
      (h: any) => normalizeDayKey(h.day) === currentDay,
    );
    if (!todaySchedule || !todaySchedule.enabled) return false;

    const currentTime = (typeof bizNow === 'object' && 'hours' in bizNow ? bizNow.hours : 0) * 60 +
      (typeof bizNow === 'object' && 'minutes' in bizNow ? bizNow.minutes : 0);
    const [startHour, startMin] = todaySchedule.startTime.split(":").map(Number);
    const [endHour, endMin] = todaySchedule.endTime.split(":").map(Number);
    const startTimeInMinutes = startHour * 60 + (startMin || 0);
    const endTimeInMinutes = endHour * 60 + (endMin || 0);

    return currentTime >= startTimeInMinutes && currentTime <= endTimeInMinutes;
  }, [settings, getBusinessNow, normalizeDayKey]);

  /** Build the business hours subtitle, e.g. "Service hours: 10:00–23:00 (UTC+7)" */
  const businessHoursSubtitle = useMemo(() => {
    if (!settings?.enable_business_hours || !settings?.business_hours) return null;

    const bizNow = getBusinessNow();
    const currentDay =
      typeof bizNow === "object" && "day" in bizNow
        ? normalizeDayKey(bizNow.day)
        : "";

    const todaySchedule = settings.business_hours.find(
      (h: any) => normalizeDayKey(h.day) === currentDay && h.enabled,
    );

    // Format timezone label
    const tz = settings.timezone || '';
    let tzLabel = '';
    if (tz) {
      try {
        // Try to get a short offset from IANA
        const offset = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset',
        }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value;
        tzLabel = offset || tz;
      } catch {
        tzLabel = tz;
      }
    }

    if (!todaySchedule) {
      return `${t("closedToday")}${tzLabel ? ` (${tzLabel})` : ''}`;
    }

    return `${t("serviceHours")} ${todaySchedule.startTime}–${todaySchedule.endTime}${tzLabel ? ` (${tzLabel})` : ''}`;
  }, [settings, getBusinessNow, normalizeDayKey]);

  const position = settings?.position || "bottom-right";

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  if (!isInitialized) return null;

  return (
    <div class={`cdk-widget cdk-${position} ${isCompactBubble ? "cdk-widget-compact" : ""}`}>
      {/* Chat Panel */}
      <div class={`cdk-panel ${isOpen ? "cdk-panel-open" : ""}`}>
        {/* Header */}
        <div class="cdk-header">
          {config?.website_url && (
            <img
              src={`https://www.google.com/s2/favicons?domain=${config.website_url}&sz=64`}
              alt="Avatar"
              class="cdk-header-avatar"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <div class="cdk-header-info">
            <div class="cdk-header-title">{config?.name || t("defaultTitle")}</div>
            <div class={`cdk-header-subtitle ${agentTyping ? 'cdk-subtitle-typing' : ''}`}>
              {agentTyping
                ? t("agentTyping")
                : (businessHoursSubtitle || settings?.subtitle || t("defaultSubtitle"))
              }
            </div>
          </div>
          <button
            class="cdk-header-close"
            onClick={() => setIsOpen(false)}
            aria-label={t("close")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16.5a1 1 0 0 1-.7-.29l-6-6A1 1 0 0 1 6.7 8.79L12 14.09l5.3-5.3a1 1 0 1 1 1.41 1.42l-6 6A1 1 0 0 1 12 16.5z" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div class="cdk-messages">
          {/* Welcome or Offline message */}
          {messages.length === 0 &&
            (isOnline
              ? settings?.welcomeMessage
              : settings?.offlineMessage ||
              t("offlineMessage")) && (
              <div class="cdk-msg cdk-msg-agent">
                <div class="cdk-msg-bubble cdk-msg-bubble-agent">
                  {isOnline
                    ? settings?.welcomeMessage
                    : settings?.offlineMessage ||
                    t("offlineMessage")}
                </div>
              </div>
            )}

          {messages.map((msg) => {
            const isFailed = failedMsgIds.has(msg.id);
            return (
              <div
                key={msg.id}
                class={`cdk-msg ${msg.sender_type === "contact" ? "cdk-msg-visitor" : "cdk-msg-agent"} ${isFailed ? "cdk-msg-failed" : ""}`}
              >
                <div
                  class={`cdk-msg-bubble ${msg.sender_type === "contact" ? "cdk-msg-bubble-visitor" : "cdk-msg-bubble-agent"} ${isFailed ? "cdk-msg-bubble-failed" : ""}`}
                >
                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div class="cdk-msg-attachments">
                      {msg.attachments.map((att) => {
                        const isImg = att.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.url || att.name);
                        return isImg ? (
                          <a href={att.url} target="_blank" rel="noopener noreferrer" class="cdk-attachment-img-link">
                            <img src={att.url} alt={att.name} class="cdk-attachment-img" loading="lazy" />
                          </a>
                        ) : (
                          <a href={att.url} target="_blank" rel="noopener noreferrer" class="cdk-attachment-file">
                            <span class="cdk-attachment-icon">📎</span>
                            <span class="cdk-attachment-name">{att.name}</span>
                            {att.size && <span class="cdk-attachment-size">({(att.size / 1024).toFixed(0)}KB)</span>}
                          </a>
                        );
                      })}
                    </div>
                  )}
                  {msg.content && <span>{msg.content}</span>}
                </div>
                <div class="cdk-msg-meta">
                  {isFailed ? (
                    <div class="cdk-msg-error">
                      <span class="cdk-msg-error-text">{t("sendFailed")}</span>
                      <button
                        class="cdk-msg-retry-btn"
                        onClick={() => handleRetry(msg.id)}
                        title={t("retry")}
                      >⟳ {t("retry")}</button>
                      <button
                        class="cdk-msg-delete-btn"
                        onClick={() => {
                          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                          setFailedMsgIds((prev) => {
                            const next = new Set(prev);
                            next.delete(msg.id);
                            return next;
                          });
                        }}
                        title={t("delete")}
                      >✕</button>
                    </div>
                  ) : (
                    <div class="cdk-msg-time">{formatTime(msg.sent_at)}</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {agentTyping && (
            <div class="cdk-msg cdk-msg-agent">
              <div class="cdk-msg-bubble cdk-msg-bubble-agent cdk-typing">
                <span class="cdk-dot" />
                <span class="cdk-dot" />
                <span class="cdk-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Toast */}
        {errorToast && (
          <div class="cdk-toast cdk-toast-error">
            <span>⚠️ {errorToast}</span>
            <button class="cdk-toast-close" onClick={() => setErrorToast(null)}>✕</button>
          </div>
        )}

        {/* Input */}
        <div class="cdk-input-wrapper">
          {showEmoji && <EmojiPicker onSelect={appendEmoji} />}

          <div class="cdk-input-area">
            <div class="cdk-input-box">
              <textarea
                ref={inputRef}
                class="cdk-input"
                placeholder={settings?.placeholderText || t("defaultPlaceholder")}
                value={inputText}
                onInput={(e) => {
                  setInputText((e.target as HTMLTextAreaElement).value);
                  const conversationId = storage.getConversationId();
                  if (conversationId) {
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    } else {
                      // Only emit true if we aren't already typing
                      widgetSocket.emitTyping(conversationId, true);
                    }

                    // Stop typing after 2.5 seconds of inactivity
                    typingTimeoutRef.current = window.setTimeout(() => {
                      widgetSocket.emitTyping(conversationId, false);
                      typingTimeoutRef.current = null;
                    }, 2500);
                  }
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isSending}
              />

              <button
                type="button"
                class="cdk-action-btn"
                onClick={() => setShowEmoji(!showEmoji)}
                title={t("addEmoji")}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
              </button>

              <label class="cdk-action-btn" title={t("attachFile")}>
                <input
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </label>
            </div>

            <button
              class="cdk-send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || isSending}
              aria-label={t("send")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      {!(isOpen && isCompactBubble) && (
        <button
          class={`cdk-toggle ${!isOpen && isCompactBubble ? "cdk-toggle-compact" : ""} ${!isOpen && isCompactBubble && position.includes("left") ? "cdk-compact-left" : ""}`}
          onClick={toggleWidget}
          aria-label={t("toggleChat")}
        >
          {!isCompactBubble && isOpen ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.25"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 10l6 6 6-6" />
            </svg>
          ) : isCompactBubble ? (
            <div class="cdk-compact-inner">
              <img
                src={launcherLogoSrc}
                alt=""
                aria-hidden="true"
                class="cdk-compact-logo"
              />
              <span class="cdk-compact-title">
                {t("chatWithUs")}
              </span>
            </div>
          ) : (
            <img src={launcherLogoSrc} alt="" aria-hidden="true" class="cdk-toggle-logo" />
          )}
          {unreadCount > 0 && !isOpen && (
            <span class="cdk-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
      )}
    </div>
  );
};

export default Widget;
