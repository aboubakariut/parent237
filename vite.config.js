import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => ({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // injectManifest (au lieu de generateSW) : on fournit notre propre
      // fichier service worker (src/sw.js) pour pouvoir gérer les événements
      // 'push' et 'notificationclick' — nécessaire pour les vraies
      // notifications push (générées automatiquement par generateSW, elles ne
      // permettent pas d'ajouter ce genre de logique personnalisée).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Parent+237',
        short_name: 'Parent+237',
        description: "Le coach parental accessible à tous, même hors ligne.",
        theme_color: '#1B2A4A',
        background_color: '#F7F2E4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    }),
    // Only obfuscate the production build. In dev you get normal, readable code.
    mode === 'production' &&
      obfuscator({
        include: ['**/*.js'],
        exclude: [/node_modules/],
        apply: 'build',
        debugger: false,
        options: {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.3,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.85,
          rotateStringArray: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          selfDefending: true,
          disableConsoleOutput: true,
          numbersToExpressions: true,
          splitStrings: true,
          splitStringsChunkLength: 6
        }
      })
  ].filter(Boolean),
  build: {
    sourcemap: false, // never ship sourcemaps in production
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
      mangle: { toplevel: true },
      format: { comments: false }
    }
  }
}));
