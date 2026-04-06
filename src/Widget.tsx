import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { Message, WidgetConfig, WidgetSettings } from './types';
import { api } from './api';
import { widgetSocket } from './socket';
import {
  storage,
  generateVisitorId,
  getBrowserInfo,
  getPageInfo,
} from './storage';
import './styles.css';

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
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);

  const settings = config?.settings;

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
        storage.setCompanyId(data.company_id);
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
      } catch (err) {
        console.error('[CDK Widget] Init failed:', err);
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
    });

    const unsubTyping = widgetSocket.onTyping((data) => {
      setAgentTyping(data.isTyping);
    });

    return () => {
      unsubMessage();
      unsubTyping();
    };
  }, [isInitialized, isOpen]);

  // ============= Auto scroll =============
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    setInputText('');

    // Optimistic: add message locally
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      content: text,
      sender_type: 'contact',
      message_type: 'incoming',
      sent_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const conversationId = storage.getConversationId() || '';
      const visitorId = storage.getVisitorId() || '';

      const response = await api.sendMessage({
        conversation_id: conversationId,
        widget_id: widgetId,
        visitor_id: visitorId,
        sender_name: visitorId,
        message: text,
        message_type: 'text',
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
                sender_type: 'contact',
                message_type: 'incoming',
                attachments: response.data?.attachments,
                sent_at: response.data?.sent_at || optimisticMsg.sent_at,
              }
            : m,
        ),
      );
    } catch (err) {
      console.error('[CDK Widget] Send failed:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text); // Restore input
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, widgetId]);

  // ============= Key handlers =============
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleWidget = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) setUnreadCount(0);
  };

  // ============= Render helpers =============
  const primaryColor = settings?.primaryColor || '#4F46E5';
  const position = settings?.position || 'bottom-right';

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  if (!isInitialized) return null;

  return (
    <div class={`cdk-widget cdk-${position}`}>
      {/* Chat Panel */}
      <div class={`cdk-panel ${isOpen ? 'cdk-panel-open' : ''}`}>
        {/* Header */}
        <div class="cdk-header" style={{ backgroundColor: primaryColor }}>
          <div class="cdk-header-info">
            <div class="cdk-header-title">{config?.name || 'Chat'}</div>
            <div class="cdk-header-subtitle">
              {settings?.widget_bubble_launcher_title ||
                'We typically reply within minutes'}
            </div>
          </div>
          <button
            class="cdk-header-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div class="cdk-messages">
          {/* Welcome message */}
          {messages.length === 0 && settings?.welcomeMessage && (
            <div class="cdk-msg cdk-msg-agent">
              <div class="cdk-msg-bubble cdk-msg-bubble-agent">
                {settings.welcomeMessage}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              class={`cdk-msg ${msg.sender_type === 'contact' ? 'cdk-msg-visitor' : 'cdk-msg-agent'}`}
            >
              <div
                class={`cdk-msg-bubble ${msg.sender_type === 'contact' ? 'cdk-msg-bubble-visitor' : 'cdk-msg-bubble-agent'}`}
                style={
                  msg.sender_type === 'contact'
                    ? { backgroundColor: primaryColor }
                    : {}
                }
              >
                {msg.content}
              </div>
              <div class="cdk-msg-time">{formatTime(msg.sent_at)}</div>
            </div>
          ))}

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

        {/* Input */}
        <div class="cdk-input-area">
          <textarea
            ref={inputRef}
            class="cdk-input"
            placeholder={settings?.placeholderText || 'Type a message...'}
            value={inputText}
            onInput={(e) =>
              setInputText((e.target as HTMLTextAreaElement).value)
            }
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isSending}
          />
          <button
            class="cdk-send-btn"
            onClick={handleSend}
            disabled={!inputText.trim() || isSending}
            style={{ backgroundColor: primaryColor }}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

        {/* Footer */}
        <div class="cdk-footer">
          <span>
            Powered by{' '}
            <a href="https://chatdakenh.com" target="_blank" rel="noopener">
              ChatDaKenh
            </a>
          </span>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        class="cdk-toggle"
        onClick={toggleWidget}
        style={{ backgroundColor: primaryColor }}
        aria-label="Toggle chat"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        {unreadCount > 0 && !isOpen && (
          <span class="cdk-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
    </div>
  );
};

export default Widget;
