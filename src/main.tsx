/**
 * ChatDaKenh Widget SDK — Entry Point
 *
 * Usage trên website khách hàng:
 * <script src="https://cdn.chatdakenh.com/widget.js"
 *         data-widget-id="widget_abc123"
 *         data-api-url="https://api.chatdakenh.com"
 *         data-ws-url="https://ws.chatdakenh.com"
 *         async></script>
 *
 * Hoặc manual:
 * window.ChatDaKenh.init({ widgetId: 'widget_abc123' })
 */
import { render, type ComponentChild } from 'preact';
import Widget from './Widget';

interface WidgetInstance {
  container: HTMLDivElement;
  unmount: () => void;
}

const instances = new Map<string, WidgetInstance>();

// Default URLs — có thể override qua script tag attributes hoặc init()
const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3002';

/**
 * Mount widget vào DOM
 */
function mountWidget(config: {
  widgetId: string;
  apiUrl?: string;
  wsUrl?: string;
}): void {
  const { widgetId, apiUrl = DEFAULT_API_URL, wsUrl = DEFAULT_WS_URL } = config;

  // Prevent duplicate mount
  if (instances.has(widgetId)) {
    console.warn(`[CDK] Widget ${widgetId} already mounted`);
    return;
  }

  // Create isolated container
  const container = document.createElement('div');
  container.id = `cdk-widget-${widgetId}`;
  container.setAttribute('data-cdk-widget', 'true');
  document.body.appendChild(container);

  // Render Preact component
  render(
    (
      <Widget widgetId={widgetId} apiUrl={apiUrl} wsUrl={wsUrl} />
    ) as ComponentChild,
    container,
  );

  instances.set(widgetId, {
    container,
    unmount: () => {
      render(null, container);
      container.remove();
    },
  });

  console.log(`[CDK] Widget mounted: ${widgetId}`);
}

/**
 * Destroy widget
 */
function destroyWidget(widgetId?: string): void {
  if (widgetId) {
    const instance = instances.get(widgetId);
    if (instance) {
      instance.unmount();
      instances.delete(widgetId);
    }
  } else {
    instances.forEach((instance) => instance.unmount());
    instances.clear();
  }
}

/**
 * Auto-init from <script> tag attributes
 */
function autoInit(): void {
  // Find the script tag that loaded this file
  const scripts = document.querySelectorAll('script[data-widget-id]');

  scripts.forEach((script) => {
    const widgetId = script.getAttribute('data-widget-id');
    const apiUrl = script.getAttribute('data-api-url') || DEFAULT_API_URL;
    const wsUrl = script.getAttribute('data-ws-url') || DEFAULT_WS_URL;

    if (widgetId) {
      mountWidget({ widgetId, apiUrl, wsUrl });
    }
  });
}

// ============= Public SDK API =============
const ChatDaKenh = {
  init: mountWidget,
  destroy: destroyWidget,
  version: '1.0.0',
};

// Expose to window
if (typeof window !== 'undefined') {
  (window as any).ChatDaKenh = ChatDaKenh;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    // DOM already loaded (async script)
    autoInit();
  }
}

export default ChatDaKenh;
