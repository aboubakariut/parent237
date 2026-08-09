import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

// Précache l'app shell (généré automatiquement par vite-plugin-pwa au build).
precacheAndRoute(self.__WB_MANIFEST);

// Polices Google Fonts et icônes Font Awesome : mises en cache après le
// premier chargement pour un fonctionnement 100% hors-ligne ensuite.
registerRoute(
  ({ url }) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })]
  })
);

registerRoute(
  ({ url }) => /^https:\/\/cdnjs\.cloudflare\.com\//.test(url.href),
  new CacheFirst({
    cacheName: 'font-awesome',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })]
  })
);

self.skipWaiting();
clientsClaim();

/* ---------------- Notifications push ---------------- */
// Reçoit un push envoyé par la fonction serveur (voir supabase/functions/send-push)
// et affiche une notification système, même si l'app est complètement fermée.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Parent+237', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Parent+237';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur une notification : ramène au premier onglet ouvert, ou en ouvre un.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
