import { io, type Socket } from 'socket.io-client'
import { SOCKET_EVENTS } from './constants'
import { storage } from './storage'
import type { Message } from './types'

type MessageHandler = (message: Message) => void
type TypingHandler = (data: { isTyping: boolean }) => void
type DisconnectHandler = (reason: string) => void

/**
 * Widget Socket Service — Self-contained
 * Auth bằng session_token (KHÔNG dùng JWT user của Dashboard)
 */
class WidgetSocketService {
  private socket: Socket | null = null
  private wsUrl: string = ''
  private pendingJoinConversationId: string | null = null
  private handlers = {
    message: new Set<MessageHandler>(),
    typing: new Set<TypingHandler>(),
    disconnect: new Set<DisconnectHandler>(),
  }

  configure(wsUrl: string): void {
    this.wsUrl = wsUrl
  }

  /**
   * Connect to WebSocket server
   * Auth = session_token (widget session, không phải user JWT)
   */
  connect(): void {
    if (this.socket?.connected) {
      // Already connected — just join room if pending
      this._joinStoredConversation()
      return
    }

    const sessionToken = storage.getSessionToken()
    if (!sessionToken) {
      console.warn('[CDK Widget] No session token, skipping socket connection')
      return
    }

    this.socket = io(this.wsUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
      auth: {
        token: sessionToken,
        type: 'widget',
      },
    })

    this.socket.on('connect', () => {
      console.log('[CDK Widget] Socket connected, id:', this.socket?.id)
      this._joinStoredConversation()
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[CDK Widget] Socket disconnected:', reason)
      this.handlers.disconnect.forEach(h => h(reason))
    })

    this.socket.on('reconnect', () => {
      console.log('[CDK Widget] Socket reconnected')
      this._joinStoredConversation()
    })

    // Confirm room join
    this.socket.on('joined_conversation', (data: any) => {
      console.log('[CDK Widget] ✅ Confirmed joined room:', data?.conversationId)
    })

    // Listen for agent messages
    // Gateway emits 'receive_message' event (the LEGACY event name)
    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE_LEGACY, (data) => {
      console.log('[CDK Widget] 📩 Received event [receive_message]:', JSON.stringify(data).substring(0, 200))
      this._handleIncomingMessage(data)
    })

    // Also listen on widget-specific namespace (future-proofing)
    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE, (data) => {
      console.log('[CDK Widget] 📩 Received event [widget:message]:', JSON.stringify(data).substring(0, 200))
      this._handleIncomingMessage(data)
    })

    // Listen for typing indicator from agent
    this.socket.on(SOCKET_EVENTS.AGENT_TYPING, (data) => {
      this.handlers.typing.forEach(h => h(data))
    })

    // Also listen for generic typing event (what the gateway actually emits)
    this.socket.on('typing', (data) => {
      this.handlers.typing.forEach(h => h({ isTyping: data?.isTyping ?? false }))
    })

    // Session expired → force re-init
    this.socket.on(SOCKET_EVENTS.SESSION_EXPIRED, () => {
      console.warn('[CDK Widget] Session expired')
      this.disconnect()
      storage.clearAll()
    })

    this.socket.on('error', (error) => {
      console.error('[CDK Widget] Socket error:', error)
    })

    this.socket.on('connect_error', (error) => {
      console.error('[CDK Widget] Socket connect_error:', error.message)
    })
  }

  /**
   * Join stored conversation room after connect/reconnect
   */
  private _joinStoredConversation(): void {
    const conversationId = this.pendingJoinConversationId || storage.getConversationId()
    if (conversationId) {
      this.joinConversation(conversationId)
    }
  }

  /**
   * Process incoming message from socket
   */
  private _handleIncomingMessage(data: any): void {
    // Backend format: { data: { messages: MessageEntity }, success: true }
    const message = data?.data?.messages
    if (!message) {
      console.warn('[CDK Widget] Received message event but no message data:', data)
      return
    }
 
    console.log('[CDK Widget] Message details — type:', message.message_type, ', sender:', message.sender_type, ', content:', message.content?.substring(0, 50))
    console.log('[CDK Widget] extra_info type:', typeof message.extra_info, 'content:', JSON.stringify(message.extra_info))

    // Accept outgoing messages (from agent) — incoming (from self) already added locally via optimistic UI
    if (message.message_type === 'outgoing') {
      const normalizedMessage: Message = {
        id: message.id,
        content: message.content,
        content_type: message.content_type,
        sender_type: 'user', // user = agent side
        message_type: message.message_type,
        attachments: message.attachments,
        extra_info: message.extra_info,
        sent_at: message.sent_at,
        quote_id: message.quote_id,
      }
      this.handlers.message.forEach(h => h(normalizedMessage))
    } else {
      console.log('[CDK Widget] Skipped own message (incoming):', message.id)
    }
  }

  /**
   * Join conversation room để nhận messages
   */
  joinConversation(conversationId: string): void {
    this.pendingJoinConversationId = conversationId

    if (!this.socket?.connected) {
      console.log('[CDK Widget] Socket not connected yet, will join room on connect:', conversationId)
      return
    }

    // Emit join event to server
    this.socket.emit(SOCKET_EVENTS.JOIN_LEGACY, conversationId)
    console.log('[CDK Widget] Emitted join_receive_message for:', conversationId)
  }

  /**
   * Leave conversation room
   */
  leaveConversation(conversationId: string): void {
    if (!this.socket?.connected) return
    this.socket.emit('leave_receive_message', conversationId)
  }

  /**
   * Emit typing event
   */
  emitTyping(conversationId: string, isTyping: boolean): void {
    // Use 'typing' directly — matches Gateway @SubscribeMessage('typing')
    this.socket?.emit('typing', { conversationId, isTyping })
  }

  /**
   * Disconnect socket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  // ============= Event Handlers =============

  onMessage(handler: MessageHandler): () => void {
    this.handlers.message.add(handler)
    return () => { this.handlers.message.delete(handler) }
  }

  onTyping(handler: TypingHandler): () => void {
    this.handlers.typing.add(handler)
    return () => { this.handlers.typing.delete(handler) }
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.handlers.disconnect.add(handler)
    return () => { this.handlers.disconnect.delete(handler) }
  }
}

export const widgetSocket = new WidgetSocketService()
