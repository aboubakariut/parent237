import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// =====================================================================
// L'obfuscation a été RETIRÉE, volontairement.
//
// `controlFlowFlattening` + `deadCodeInjection` + `selfDefending` +
// `splitStrings` multipliaient la taille du bundle par deux à quatre et
// ralentissaient fortement l'exécution sur les téléphones d'entrée de
// gamme — c'est-à-dire précisément les appareils de la cible. On pénalisait
// le critère Accessibilité, qui vaut un sixième de la note du concours,
// pour protéger quelques centaines de lignes de JavaScript qu'un
// développeur compétent réécrit en un week-end.
//
// `disableConsoleOutput` privait en plus de tout diagnostic quand un
// facilitateur appelle depuis le terrain.
//
// Après retrait, désinstaller la dépendance :
//     npm remove vite-plugin-javascript-obfuscator
// =====================================================================

export default defineConfig(() => ({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // On fournit notre propre service worker (src/sw.js) pour gérer
      // 'push', 'notificationclick' et la mise en cache d'exécution
      // (src/swRuntime.js) — impossible avec generateSW.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Les enregistrements audio ne sont PAS précachés en bloc : ils
        // sont mis en cache à la demande (swRuntime.js) pour ne pas
        // imposer un téléchargement massif à la première ouverture.
        globIgnores: ['**/audio/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Parent+237',
        short_name: 'Parent+237',
        description: "Le coach parental accessible à tous, même hors ligne.",
        lang: 'fr',
        dir: 'ltr',
        theme_color: '#1B2A4A',
        background_color: '#F7F2E4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Enregistrer une session', short_name: 'Session', url: '/#/sessions' }
        ]
      }
    })
  ],
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        // On garde console.warn et console.error : ce sont les seuls
        // diagnostics disponibles quand un facilitateur signale un
        // problème depuis une zone rurale.
        pure_funcs: ['console.log', 'console.debug', 'console.info'],
        drop_debugger: true
      },
      mangle: { toplevel: true },
      format: { comments: false }
    },
    // Budget de taille : au-delà, on dégrade l'expérience sur 2G.
    chunkSizeWarningLimit: 300
  }
}));
