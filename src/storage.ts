import { STORAGE_KEYS } from './constants'

/**
 * Storage — localStorage with sessionStorage fallback
 * Zero external dependencies
 */
class StorageManager {
  private get(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? null
    } catch {
      return null
    }
  }

  private set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      try { sessionStorage.setItem(key, value) } catch { /* silent */ }
    }
  }

  private remove(key: string): void {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch { /* silent */ }
  }

  // Visitor
  getVisitorId(): string | null { return this.get(STORAGE_KEYS.VISITOR_ID) }
  setVisitorId(id: string): void { this.set(STORAGE_KEYS.VISITOR_ID, id) }

  // Conversation
  getConversationId(): string | null { return this.get(STORAGE_KEYS.CONVERSATION_ID) }
  setConversationId(id: string): void { this.set(STORAGE_KEYS.CONVERSATION_ID, id) }

  // Session
  getSessionToken(): string | null { return this.get(STORAGE_KEYS.SESSION_TOKEN) }
  setSessionToken(token: string): void { this.set(STORAGE_KEYS.SESSION_TOKEN, token) }

  // Tenant
  getTenantId(): string | null { return this.get(STORAGE_KEYS.TENANT_ID) }
  setTenantId(id: string): void { this.set(STORAGE_KEYS.TENANT_ID, id) }

  // Clear all
  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => this.remove(key))
  }
}

export const storage = new StorageManager()

/**
 * Generate unique visitor ID
 */
export function generateVisitorId(): string {
  const random = Math.random().toString(36).substring(2, 15)
  const timestamp = Date.now().toString(36)
  return `visitor_${random}${timestamp}`
}

/**
 * Browser info for session initialization
 */
export function getBrowserInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language || 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}`,
  }
}

/**
 * Current page info
 */
export function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
  }
}
