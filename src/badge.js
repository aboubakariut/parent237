// Génère une image "certificat de progression" et propose le partage direct
// vers WhatsApp via l'API Web Share. C'est le moteur de viralité communautaire :
// chaque parent qui termine un module devient un vecteur de diffusion.

export function renderBadge(canvas, { name = 'Un parent', theme, level = 1 }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // fond
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1B2A4A');
  grad.addColorStop(1, '#38507A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // pastille or
  ctx.beginPath();
  ctx.fillStyle = '#E8A33D';
  ctx.arc(W / 2, 130, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1B2A4A';
  ctx.font = 'bold 46px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(level), W / 2, 148);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 20px "Work Sans", sans-serif';
  ctx.fillText('Parent+237 — Certificat', W / 2, 220);

  ctx.font = 'bold 30px "Baloo 2", sans-serif';
  wrapText(ctx, theme, W / 2, 270, W - 80, 36);

  ctx.font = '500 18px "Work Sans", sans-serif';
  ctx.fillStyle = '#E8A33D';
  ctx.fillText(name, W / 2, H - 60);

  ctx.font = '400 13px "Work Sans", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(new Date().toLocaleDateString('fr-FR'), W / 2, H - 34);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lines = [];
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w + ' ';
    } else {
      line = test;
    }
  }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, y + i * lineHeight));
}

export async function shareBadge(canvas, { theme }) {
  canvas.toBlob(async (blob) => {
    const file = new File([blob], 'parent237-badge.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Parent+237',
          text: `J'ai terminé le module "${theme}" sur Parent+237 💛 Essaie aussi : https://parent237.app`
        });
        return;
      } catch (e) {
        // l'utilisateur a annulé le partage — pas d'erreur à afficher
      }
    }
    // Repli : téléchargement direct si le partage natif n'est pas disponible
    const link = document.createElement('a');
    link.download = 'parent237-badge.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, 'image/png');
}
