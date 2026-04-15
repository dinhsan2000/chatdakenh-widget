import { io, type Socket } from 'socket.io-client'
import { SOCKET_EVENTS } from './constants'
import { storage } from './storage'
import type { Message } from './types'

type MessageHandler = (message: Message) => void
type TypingHandler = (data: { isTyping: boolean }) => void
type DisconnectHandler = (reason: string) => void

/**
 * Widget Socket Service — Self-contained
 * Auth via session_token (NOT Dashboard user JWT)
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
    if (!sessionToken) return

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
      this._joinStoredConversation()
    })

    this.socket.on('disconnect', (reason) => {
      this.handlers.disconnect.forEach(h => h(reason))
    })

    this.socket.on('reconnect', () => {
      this._joinStoredConversation()
    })

    // Listen for agent messages (legacy event name from Gateway)
    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE_LEGACY, (data) => {
      this._handleIncomingMessage(data)
    })

    // Also listen on widget-specific namespace (future-proofing)
    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE, (data) => {
      this._handleIncomingMessage(data)
    })

    // Listen for typing indicator from agent
    this.socket.on(SOCKET_EVENTS.AGENT_TYPING, (data) => {
      this.handlers.typing.forEach(h => h(data))
    })

    // Also listen for generic typing event (emitted by Gateway)
    this.socket.on('typing', (data) => {
      this.handlers.typing.forEach(h => h({ isTyping: data?.isTyping ?? false }))
    })

    // Session expired — force re-init
    this.socket.on(SOCKET_EVENTS.SESSION_EXPIRED, () => {
      this.disconnect()
      storage.clearAll()
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
    if (!message) return

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
    }
  }

  /**
   * Join conversation room to receive messages
   */
  joinConversation(conversationId: string): void {
    this.pendingJoinConversationId = conversationId

    if (!this.socket?.connected) return

    this.socket.emit(SOCKET_EVENTS.JOIN_LEGACY, conversationId)
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
    // Use 'typing' directly — matches Gateway handler
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
