/**
 * Lightweight i18n for the widget.
 * Locale can be set via data-lang attribute or widget_config.
 */

export interface Locale {
  // Chat panel
  defaultTitle: string
  defaultSubtitle: string
  agentTyping: string
  closedToday: string
  serviceHours: string

  // Messages
  offlineMessage: string
  defaultPlaceholder: string

  // Actions
  close: string
  send: string
  toggleChat: string
  addEmoji: string
  attachFile: string
  chatWithUs: string

  // Errors
  sendFailed: string
  sendFailedToast: string
  retryFailed: string
  retry: string
  delete: string

  // File upload
  fileTooLarge: string
  uploading: string
  uploadFailed: string
}

const en: Locale = {
  defaultTitle: 'Chat',
  defaultSubtitle: 'We typically reply within minutes',
  agentTyping: 'Agent is typing...',
  closedToday: 'Closed today',
  serviceHours: 'Service hours:',

  offlineMessage: "We're currently offline. Leave a message and we'll get back to you!",
  defaultPlaceholder: 'Type a message...',

  close: 'Close',
  send: 'Send',
  toggleChat: 'Toggle chat',
  addEmoji: 'Add emoji',
  attachFile: 'Attach file',
  chatWithUs: 'Chat with us',

  sendFailed: 'Send failed',
  sendFailedToast: 'Failed to send message. Tap to retry.',
  retryFailed: 'Retry failed. Check your connection.',
  retry: 'Retry',
  delete: 'Delete',

  fileTooLarge: 'File too large ({{size}}MB). Max allowed: 10MB.',
  uploading: 'Uploading {{name}}...',
  uploadFailed: 'Upload failed: {{error}}',
}

const vi: Locale = {
  defaultTitle: 'Chat',
  defaultSubtitle: 'Chúng tôi thường phản hồi trong vài phút',
  agentTyping: 'Nhân viên đang nhập...',
  closedToday: 'Hôm nay nghỉ',
  serviceHours: 'Giờ làm việc:',

  offlineMessage: 'Chúng tôi hiện không trực tuyến. Hãy để lại tin nhắn, chúng tôi sẽ phản hồi sớm nhất!',
  defaultPlaceholder: 'Nhập tin nhắn...',

  close: 'Đóng',
  send: 'Gửi',
  toggleChat: 'Mở/đóng chat',
  addEmoji: 'Thêm emoji',
  attachFile: 'Đính kèm file',
  chatWithUs: 'Chat với chúng tôi',

  sendFailed: 'Gửi thất bại',
  sendFailedToast: 'Gửi tin nhắn thất bại. Nhấn để thử lại.',
  retryFailed: 'Thử lại thất bại. Kiểm tra kết nối mạng.',
  retry: 'Thử lại',
  delete: 'Xoá',

  fileTooLarge: 'File quá lớn ({{size}}MB). Tối đa: 10MB.',
  uploading: 'Đang tải {{name}}...',
  uploadFailed: 'Tải lên thất bại: {{error}}',
}

const locales: Record<string, Locale> = { en, vi }

let currentLocale: Locale = en

export function setLocale(lang: string): void {
  currentLocale = locales[lang] || en
}

export function t(key: keyof Locale, params?: Record<string, string>): string {
  let value = currentLocale[key] || en[key]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{{${k}}}`, v)
    }
  }
  return value
}

export function getLocale(): Locale {
  return currentLocale
}
