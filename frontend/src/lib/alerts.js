// Alerts for staff on the website: a sound + vibration, plus a browser
// notification when the tab isn't being looked at (if the browser allows it).
// The Android app (android-app/) has its own native alerts.

let ready = false;

// Call once after a staff member logs in (asks for permission the first time).
export async function enableAlerts() {
  try {
    if ('Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      ready = Notification.permission === 'granted';
    }
  } catch {
    ready = false;
  }
  return ready;
}

export const alertsBlocked = () => 'Notification' in window && Notification.permission === 'denied';

// Plays a short soft chime (no audio file needed).
export function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tone = (freq, start) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.5);
    };
    tone(880, 0);
    tone(1175, 0.18);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* sound not available */
  }
  try { navigator.vibrate?.([120, 60, 120]); } catch { /* no vibration */ }
}

/** A chime while the tab is open; a browser notification when it's in the background. */
export function staffAlert(title, body) {
  if (!document.hidden) chime();
  if (!ready || !document.hidden) return;
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag: `${title}-${Date.now()}` });
  } catch {
    /* notification failed */
  }
}
