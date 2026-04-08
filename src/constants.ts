// ============= STORAGE KEYS =============
export const STORAGE_KEYS = {
  VISITOR_ID: 'cdk_visitor_id',
  CONVERSATION_ID: 'cdk_conversation_id',
  SESSION_TOKEN: 'cdk_session_token',
  TENANT_ID: 'cdk_tenant_id',
} as const

// ============= SOCKET EVENTS =============
export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_CONVERSATION: 'widget:join',
  LEAVE_CONVERSATION: 'widget:leave',
  TYPING: 'widget:typing',

  // Server → Client
  RECEIVE_MESSAGE: 'widget:message',
  AGENT_TYPING: 'widget:agent_typing',
  SESSION_EXPIRED: 'widget:session_expired',

  // Fallback: generic event names (compatible with current Gateway)
  RECEIVE_MESSAGE_LEGACY: 'receive_message',
  JOIN_LEGACY: 'join_receive_message',
} as const
