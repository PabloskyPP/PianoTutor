/** Un único AudioContext para toda la aplicación (sintetizador y micrófono). Se crea tras un gesto del usuario. */
let ctx: AudioContext | undefined;

export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Sintetizador simple (idéntico al original): triángulo con decaimiento de 1,2 s. */
export function tone(midi: number): void {
  const ac = getAudioContext();
  if (ac.state === 'suspended') void ac.resume();
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  g.gain.setValueAtTime(0.3, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
  o.connect(g).connect(ac.destination);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(); o.stop(ac.currentTime + 1.2);
}
