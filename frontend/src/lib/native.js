// Alerts for staff: a sound + vibration, plus a system notification when the
// screen isn't being looked at. Inside the Android app this uses real Android
// notifications; on the website it uses browser notifications (if allowed).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNativeApp = () => Capacitor.isNativePlatform();

let ready = false;

// In the Android app, "in the background" comes from the app's own state
// (more reliable than the page's visibility).
let appActive = true;
if (isNativeApp()) {
  App.addListener('appStateChange', ({ isActive }) => { appActive = isActive; });
}
const inBackground = () => document.hidden || !appActive;

// Our own Android plugin (android/app/src/main/java/.../OnDutyPlugin.java):
// "On duty" mode keeps the app running in the background so alerts still arrive,
// and alert() shows a notification immediately.
const OnDuty = registerPlugin('OnDuty');

export async function startOnDuty(text) {
  if (!isNativeApp()) return;
  try { await OnDuty.start({ text }); } catch { /* older app build without the service */ }
}

export async function stopOnDuty() {
  if (!isNativeApp()) return;
  try { await OnDuty.stop(); } catch { /* ignore */ }
}

// Call once after a staff member logs in (asks for permission the first time).
export async function enableAlerts() {
  try {
    if (isNativeApp()) {
      const perm = await OnDuty.requestPermissions();
      ready = perm.notifications === 'granted';
    } else if ('Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      ready = Notification.permission === 'granted';
    }
  } catch {
    ready = false;
  }
  return ready;
}

export const alertsBlocked = () => !isNativeApp() && 'Notification' in window && Notification.permission === 'denied';

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

/** Sound always; a system notification when the app/tab is in the background. */
export async function staffAlert(title, body) {
  if (!inBackground()) chime();
  if (!ready || !inBackground()) return;
  try {
    if (isNativeApp()) {
      await OnDuty.alert({ title, body });
    } else {
      new Notification(title, { body, icon: '/favicon.svg', tag: `${title}-${Date.now()}` });
    }
  } catch {
    /* notification failed */
  }
}
