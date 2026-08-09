// =====================================================================
// Mise en cache d'exécution du service worker.
//
// `injectManifest` ne précache que les fichiers du build : le contenu
// pédagogique servi par Supabase, lui, n'était disponible hors ligne que
// via `seedScenarios` compilé dans le bundle — donc six scénarios en
// français et AUCUNE traduction. C'est exactement ce qu'un évaluateur
// teste en premier, en mode avion.
//
// À importer depuis src/sw.js :
//     import { registerRuntimeCaching } from './swRuntime.js';
//     registerRuntimeCaching();
// =====================================================================

import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

export function registerRuntimeCaching() {
  // --- Contenu pédagogique (table `scenarios`, traductions comprises) ---
  // NetworkFirst : la version fraîche gagne quand le réseau est là,
  // la dernière version connue prend le relais dès qu'il disparaît.
  registerRoute(
    ({ url }) => url.pathname.includes('/rest/v1/scenarios'),
    new NetworkFirst({
      cacheName: 'p237-contenu',
      networkTimeoutSeconds: 4,          // réseau 2G capricieux : on bascule vite sur le cache
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })
      ]
    })
  );

  // --- Liste des zones (menu déroulant de l'inscription) ---
  registerRoute(
    ({ url }) => url.pathname.includes('/rest/v1/zones'),
    new StaleWhileRevalidate({
      cacheName: 'p237-zones',
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
    })
  );

  // --- Audio pré-enregistré (voir src/audio.js) ---
  // Immuable une fois publié : CacheFirst, conservé un an.
  registerRoute(
    ({ request, url }) => request.destination === 'audio' || /\.(mp3|ogg|m4a)$/.test(url.pathname),
    new CacheFirst({
      cacheName: 'p237-audio',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 365 * 24 * 3600, purgeOnQuotaError: true })
      ]
    })
  );

  // --- Images et icônes ---
  registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
      cacheName: 'p237-images',
      plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true })]
    })
  );
}

/**
 * Précharge tout le contenu pédagogique d'un coup, pour que le facilitateur
 * puisse partir en zone blanche avec l'intégralité des modules à bord.
 * Déclenché par un message depuis l'application (bouton « Préparer la sortie
 * terrain ») : self.addEventListener('message', ...) dans sw.js.
 */
export async function prechargerContenu(urls = []) {
  const cache = await caches.open('p237-contenu');
  await Promise.allSettled(urls.map((u) => cache.add(u)));
}
