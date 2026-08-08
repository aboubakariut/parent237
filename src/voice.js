// Utilise la synthèse vocale du navigateur/téléphone : gratuite, embarquée,
// fonctionne hors-ligne une fois les voix chargées par le système.
// Zéro coût d'hébergement audio, zéro bande passante consommée pour la narration.
export function speak(text, lang = 'fr-FR') {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.95;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
