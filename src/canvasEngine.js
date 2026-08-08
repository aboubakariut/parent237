// Dessine une scène parent/enfant simple, chaleureuse et animée en Canvas 2D.
// Pas d'images externes à charger : tout est vectoriel, donc ça marche 100% hors-ligne
// et le poids de l'app reste minuscule (important sur réseau faible / stockage limité).

const PALETTE = {
  skin: '#C98A5E',
  skinLight: '#E7B98C',
  clothParent: '#1B2A4A',
  clothChild: '#E8A33D',
  ground: '#DDEBD3',
  accent: '#6B9B5E'
};

export function drawScene(canvas, { mood = 'tense' } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let frame = 0;
  let raf;

  function drawGround() {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  function drawPerson({ x, y, scale, clothColor, bob, headTilt = 0 }) {
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(scale, scale);
    ctx.rotate(headTilt);

    // head
    ctx.beginPath();
    ctx.fillStyle = PALETTE.skin;
    ctx.arc(0, -70, 26, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.beginPath();
    ctx.fillStyle = clothColor;
    ctx.moveTo(-24, -46);
    ctx.quadraticCurveTo(0, -30, 24, -46);
    ctx.lineTo(30, 40);
    ctx.quadraticCurveTo(0, 55, -30, 40);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawGround();

    const bobParent = Math.sin(frame / 30) * 2;
    const bobChild = mood === 'tense'
      ? Math.sin(frame / 6) * 6   // crise = tremblement rapide
      : Math.sin(frame / 20) * 3; // calme = respiration douce

    drawPerson({
      x: W * 0.62, y: H * 0.72, scale: 1.5,
      clothColor: PALETTE.clothParent, bob: bobParent,
      headTilt: mood === 'calm' ? -0.05 : 0
    });

    drawPerson({
      x: W * 0.32, y: H * 0.82, scale: 1,
      clothColor: PALETTE.clothChild, bob: bobChild,
      headTilt: mood === 'tense' ? Math.sin(frame / 8) * 0.15 : 0
    });

    frame++;
    raf = requestAnimationFrame(render);
  }

  render();
  return () => cancelAnimationFrame(raf);
}
