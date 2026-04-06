import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

/**
 * Plugin inject CSS vào JS bundle
 * Khi load widget.js, CSS sẽ tự inject vào <head>
 */
function cssInjectedByJsPlugin(): Plugin {
  let cssContent = ''
  return {
    name: 'css-injected-by-js',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      // Collect all CSS assets
      for (const [key, chunk] of Object.entries(bundle)) {
        if (key.endsWith('.css') && chunk.type === 'asset') {
          cssContent += chunk.source
          delete bundle[key] // Remove CSS file from output
        }
      }
      // Inject CSS into JS
      if (cssContent) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk.isEntry) {
            const cssInjection = `(function(){var s=document.createElement('style');s.setAttribute('data-cdk-widget','');s.textContent=${JSON.stringify(cssContent)};document.head.appendChild(s)})();`
            chunk.code = cssInjection + chunk.code
          }
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [preact(), cssInjectedByJsPlugin()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000/api/v1'),
    'import.meta.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || 'http://localhost:3001'),
  },
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'ChatDaKenh',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'widget.[ext]',
      },
    },
    cssCodeSplit: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
})
