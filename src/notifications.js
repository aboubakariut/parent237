import { savePushSubscription } from './supabase.js';

/* ---------------- Notifications locales ---------------- */
// Ne nécessitent AUCUNE configuration serveur : déclenchées directement par
// le navigateur/l'app quand une action se produit pendant que l'app est
// ouverte (ou juste fermée en arrière-plan, via le service worker).
// Utilisées pour : module terminé, certificat prêt à partager.

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch {
    return false;
  }
}

export async function notifyLocal(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const payload = { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', ...options };
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, payload);
      return;
    } catch {
      // repli ci-dessous si le service worker n'est pas prêt
    }
  }
  try { new Notification(title, payload); } catch { /* silencieux */ }
}

/* ---------------- Notifications push (temps réel, app fermée) ---------------- */
// Contrairement aux notifications locales ci-dessus, celles-ci arrivent même
// si l'app est complètement fermée (ex : "votre compte facilitateur a été
// approuvé"). Ça nécessite une clé VAPID (gratuite, générée une seule fois) et
// le déploiement d'une fonction serveur qui envoie réellement le push — voir
// README > "Notifications push" pour la procédure complète.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush({ deviceId = null } = {}) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY non configurée — notifications push désactivées.');
    return { ok: false, reason: 'not-configured' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  const granted = await requestNotificationPermission();
  if (!granted) return { ok: false, reason: 'permission-denied' };

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
  }

  const result = await savePushSubscription(subscription, { deviceId });
  return result.ok ? { ok: true } : { ok: false, reason: result.error };
}
