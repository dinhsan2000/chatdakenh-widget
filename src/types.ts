// ============= Widget Config =============
export interface WidgetConfig {
  widget_id: string
  name: string
  website_url?: string
  settings: WidgetSettings
}

export interface WidgetSettings {
  theme: 'light' | 'dark' | 'auto'
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  autoOpen: boolean
  showOnPages: string[]
  hideOnPages: string[]
  welcomeMessage: string
  offlineMessage: string
  placeholderText: string
  requireEmail: boolean
  collectUserInfo: boolean
  subtitle: string
  widget_bubble_type: string
  enable_business_hours: boolean
  business_hours: BusinessHour[]
  timezone: string // IANA timezone e.g. 'Asia/Ho_Chi_Minh' or UTC offset e.g. 'UTC+7'
}

export interface BusinessHour {
  day: string
  enabled: boolean
  startTime: string
  endTime: string
}

// ============= API Responses =============
export interface InitResponse {
  session_token: string
  visitor_id: string
  company_id: string
  conversation_id: string
  widget_config: WidgetConfig
}

// ============= Message Types =============
export interface MessageButton {
  id: string
  title: string
  type: 'action' | 'link'
  url?: string
}

export interface ExtraInfo {
  buttons?: MessageButton[]
  [key: string]: any
}
export interface Message {
  id: string
  content: string
  content_type?: string
  sender_type: 'contact' | 'user'  // contact = visitor, user = agent
  message_type?: 'incoming' | 'outgoing'
  attachments?: FileAttachment[]
  extra_info?: ExtraInfo
  sent_at: string
  quote_id?: string | null
  sender_id?: string
  sender_name?: string
}

export interface FileAttachment {
  id: string
  name: string
  size: number
  type: string
  url: string
}

export interface SendMessagePayload {
  conversation_id: string
  widget_id: string
  visitor_id: string
  sender_name: string
  message: string
  quote_id?: string | null
  message_type: string
  attachments?: string[]
  postback_id?: string
}

export interface SendMessageResponse {
  success: boolean
  message: string
  data: Message & {
    conversation_id?: string
    conversation?: { id: string }
  }
}

// ============= Widget SDK Config =============
export interface WidgetSDKConfig {
  widgetId: string
  apiUrl?: string  // Override API URL
  wsUrl?: string   // Override WebSocket URL
}
