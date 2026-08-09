// Fonction serveur Supabase (Deno). Envoie une vraie notification push (même
// app fermée) à un ou plusieurs abonnés, via le protocole Web Push standard.
//
// DÉCLENCHEMENT PRÉVU : un Database Webhook Supabase (Database > Webhooks,
// configurable depuis le dashboard, sans code) sur la table `profiles` :
//   - événement INSERT → prévient les admins ("nouveau facilitateur en attente")
//   - événement UPDATE  → si status passe à 'valide', prévient ce facilitateur
//     ("votre compte a été approuvé")
//
// DÉPLOIEMENT (à faire une fois, depuis votre machine avec la CLI Supabase) :
//   supabase functions deploy send-push
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:vous@exemple.cm
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=...
// Puis créez le webhook dans Database > Webhooks pointant vers l'URL de cette
// fonction (visible après le déploiement).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@example.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase envoie { type: 'INSERT'|'UPDATE', table, record, old_record }
    const { type, table, record, old_record } = payload;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let title = '';
    let body = '';
    let targetProfileIds = [];
    let notifyAdmins = false;

    if (table === 'profiles' && type === 'INSERT') {
      title = 'Nouvelle demande facilitateur';
      body = `${record.full_name || 'Un compte'} attend une validation.`;
      notifyAdmins = true;
    } else if (table === 'profiles' && type === 'UPDATE') {
      if (old_record?.status !== 'valide' && record.status === 'valide') {
        title = 'Compte validé ✅';
        body = 'Votre compte Parent+237 a été approuvé, vous avez maintenant accès à votre espace.';
        targetProfileIds = [record.id];
      }
    }

    if (!title) return new Response('ignored', { status: 200 });

    if (notifyAdmins) {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'valide');
      targetProfileIds = (admins || []).map((a) => a.id);
    }

    if (!targetProfileIds.length) return new Response('no target', { status: 200 });

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('profile_id', targetProfileIds);

    await Promise.all((subs || []).map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key }
        },
        JSON.stringify({ title, body, url: '/' })
      ).catch(async (err) => {
        // Abonnement expiré/invalide (410 Gone) : on le supprime pour ne plus
        // réessayer inutilement à chaque futur envoi.
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      })
    ));

    return new Response('sent', { status: 200 });
  } catch (err) {
    return new Response(`error: ${err.message}`, { status: 500 });
  }
});
