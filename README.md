# @chatdakenh/widget

Embeddable chat widget for websites and applications. Lightweight, real-time messaging powered by Preact and Socket.IO.

## Features

- Single `<script>` tag integration — no extra CSS needed
- Real-time messaging via Socket.IO
- File uploads & image previews
- Emoji picker
- Typing indicators
- Business hours & timezone support
- Configurable position & theme
- Compact sidebar launcher variant
- Failed message retry
- ~86KB minified bundle

## Installation

### CDN (Recommended)

```html
<script
  src="https://unpkg.com/@chatdakenh/widget/dist/widget.js"
  data-widget-id="YOUR_WIDGET_ID"
  data-api-url="https://api.chatdakenh.vn/api/v1"
  data-ws-url="wss://ws.chatdakenh.vn"
  async
></script>
```

### npm

```bash
npm install @chatdakenh/widget
```

## Usage

### Script Tag (Auto-init)

Add the script tag to your HTML. The widget auto-discovers `data-widget-id` and initializes itself:

```html
<script
  src="https://unpkg.com/@chatdakenh/widget/dist/widget.js"
  data-widget-id="widget_abc123"
  data-api-url="https://api.chatdakenh.vn/api/v1"
  data-ws-url="wss://ws.chatdakenh.vn"
  async
></script>
```

#### Data Attributes

| Attribute | Required | Description |
|---|---|---|
| `data-widget-id` | Yes | Your widget identifier |
| `data-api-url` | No | API endpoint URL |
| `data-ws-url` | No | WebSocket endpoint URL |

### JavaScript SDK (Manual init)

```javascript
window.ChatDaKenh.init({
  widgetId: 'widget_abc123',
  apiUrl: 'https://api.chatdakenh.vn/api/v1',
  wsUrl: 'wss://ws.chatdakenh.vn'
})

// Destroy widget
window.ChatDaKenh.destroy()

// Check version
console.log(window.ChatDaKenh.version)
```

## Widget Configuration

Widget settings are managed server-side and fetched during initialization:

| Setting | Type | Description |
|---|---|---|
| `theme` | `'light' \| 'dark' \| 'auto'` | Color theme |
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | Widget position on screen |
| `autoOpen` | `boolean` | Auto-open chat after 2 seconds |
| `welcomeMessage` | `string` | Initial greeting message |
| `offlineMessage` | `string` | Message shown outside business hours |
| `placeholderText` | `string` | Input textarea placeholder |
| `widget_bubble_type` | `string` | Set to `'compact'` for vertical sidebar launcher |
| `enable_business_hours` | `boolean` | Enable business hours checking |
| `business_hours` | `BusinessHour[]` | Schedule per day of week |
| `timezone` | `string` | IANA timezone (e.g., `'Asia/Ho_Chi_Minh'`) or UTC offset (e.g., `'UTC+7'`) |

## Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
git clone https://github.com/dinhsan2000/chatdakenh-widget.git
cd chatdakenh-widget
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=http://localhost:3002
```

### Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Build and serve locally for testing
npm test

# Preview production build
npm run preview
```

### Project Structure

```
src/
├── main.tsx          # Entry point, auto-init & SDK API
├── Widget.tsx        # Main widget component
├── api.ts            # HTTP client for REST endpoints
├── socket.ts         # Socket.IO service wrapper
├── storage.ts        # localStorage/sessionStorage manager
├── types.ts          # TypeScript interfaces
├── constants.ts      # Storage keys & socket event names
├── EmojiPicker.tsx   # Emoji picker component
├── styles.css        # All widget styles
└── env.d.ts          # Vite environment type definitions
```

### Build Output

The build produces a single IIFE bundle at `dist/widget.js`:

- CSS is automatically injected into `<head>` at runtime (no separate CSS file)
- All dependencies bundled inline
- Console logs stripped in production
- Minified with Terser

### Testing on a Website

Open `test.html` in a browser after building. It simulates embedding the widget on a customer website.

## Publishing

Publishing to npm is automated via GitHub Actions. To release a new version:

1. Update `version` in `package.json`
2. Commit and push
3. Create a new **Release** on GitHub with a matching tag (e.g., `v0.1.0`)
4. The workflow builds and publishes to npm automatically

### Required GitHub Configuration

| Type | Name | Description |
|---|---|---|
| Secret | `NPM_TOKEN` | npm access token (Granular, with 2FA bypass) |
| Variable | `VITE_API_URL` | Production API URL |
| Variable | `VITE_WS_URL` | Production WebSocket URL |

## License

UNLICENSED — All rights reserved.
