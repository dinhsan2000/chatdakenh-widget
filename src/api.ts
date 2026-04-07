import { storage } from './storage'
import type { InitResponse, Message, SendMessagePayload, SendMessageResponse } from './types'

/**
 * Widget API Service — Self-contained HTTP client
 * Zero dependency on axios or Dashboard
 */
class WidgetApiService {
  private baseUrl: string

  constructor() {
    this.baseUrl = ''
  }

  configure(apiUrl: string): void {
    this.baseUrl = apiUrl.replace(/\/$/, '') + '/widgets'
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = storage.getSessionToken()
    const tenantId = storage.getCompanyId()
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Initialize widget session
   */
  async initialize(payload: {
    widget_id: string
    visitor_id: string
    page_info: Record<string, string>
    browser_info: Record<string, string>
  }): Promise<InitResponse> {
    const result = await this.request<{ success: boolean; data: InitResponse }>(
      '/initialize',
      { method: 'POST', body: JSON.stringify(payload) },
    )

    if (!result.success) {
      throw new Error('Failed to initialize widget')
    }

    const data = result.data
    const normalizedSettings = {
      ...(data.widget_config.settings as unknown as Record<string, unknown>),
    }
    delete normalizedSettings.primaryColor
    delete normalizedSettings.widget_bubble_launcher_title

    return {
      ...data,
      widget_config: {
        ...data.widget_config,
        settings: normalizedSettings as unknown as InitResponse['widget_config']['settings'],
      },
    }
  }

  /**
   * Send message from visitor
   */
  async sendMessage(payload: SendMessagePayload): Promise<SendMessageResponse> {
    const result = await this.request<SendMessageResponse>(
      '/send-message',
      { method: 'POST', body: JSON.stringify(payload) },
    )

    if (!result.success) {
      throw new Error(result.message || 'Failed to send message')
    }

    return result
  }

  /**
   * Get messages for conversation
   */
  async getMessages(widgetId: string, conversationId: string): Promise<Message[]> {
    const result = await this.request<{ success: boolean; data: Message[] }>(
      `/${widgetId}/get-messages/${conversationId}`,
    )

    if (!result.success) {
      throw new Error('Failed to fetch messages')
    }

    return result.data
  }

  /**
   * Upload file from widget visitor
   * Max 10MB. Allowed: images, documents, audio, video, archives.
   */
  async uploadFile(file: File): Promise<{ url: string; name: string; size: number; type: string }> {
    const token = storage.getSessionToken()
    const tenantId = storage.getCompanyId()

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        // Do NOT set Content-Type — browser will set multipart boundary automatically
      },
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || `Upload failed: ${response.status}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.message || 'Upload failed')
    }

    return result.data
  }
}

export const api = new WidgetApiService()
