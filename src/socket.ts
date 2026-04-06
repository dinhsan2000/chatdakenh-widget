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
    if (this.socket?.connected) return

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
        type: 'widget', // Phân biệt với connection từ Dashboard
      },
    })

    this.socket.on('connect', () => {
      console.log('[CDK Widget] Socket connected')
      // Auto-rejoin conversation nếu có
      const conversationId = storage.getConversationId()
      if (conversationId) {
        this.joinConversation(conversationId)
      }
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[CDK Widget] Socket disconnected:', reason)
      this.handlers.disconnect.forEach(h => h(reason))
    })

    // Listen for agent messages
    // Hỗ trợ cả event mới (widget:message) và legacy (receive_message)
    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE, (data) => {
      this._handleIncomingMessage(data)
    })

    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE_LEGACY, (data) => {
      this._handleIncomingMessage(data)
    })

    // Listen for typing indicator from agent
    this.socket.on(SOCKET_EVENTS.AGENT_TYPING, (data) => {
      this.handlers.typing.forEach(h => h(data))
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
  }

  /**
   * Process incoming message from socket
   */
  private _handleIncomingMessage(data: any): void {
    // Backend format: { data: { messages: MessageEntity }, success: true }
    const message = data?.data?.messages
    if (!message) return

    // Chỉ nhận message outgoing (từ agent) — incoming (từ mình) đã add local rồi
    if (message.message_type === 'outgoing') {
      const normalizedMessage: Message = {
        id: message.id,
        content: message.content,
        content_type: message.content_type,
        sender_type: 'user', // user = agent side
        message_type: message.message_type,
        attachments: message.attachments,
        sent_at: message.sent_at,
        quote_id: message.quote_id,
      }
      this.handlers.message.forEach(h => h(normalizedMessage))
    }
  }

  /**
   * Join conversation room để nhận messages
   */
  joinConversation(conversationId: string): void {
    if (!this.socket?.connected) return

    // Emit event — hỗ trợ cả widget namespace mới và legacy
    this.socket.emit(SOCKET_EVENTS.JOIN_LEGACY, conversationId)
    console.log('[CDK Widget] Joined conversation:', conversationId)
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
    this.socket?.emit(SOCKET_EVENTS.TYPING, { conversationId, isTyping })
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
