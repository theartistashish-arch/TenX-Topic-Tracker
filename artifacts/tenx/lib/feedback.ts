import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";

/**
 * Plays a gentle two-tone chime once when a focus or break timer ends.
 * - Web: uses the Web Audio API to synthesise a soft sine bell.
 * - Native: uses a success haptic notification (no audio package needed).
 */
export function playChime(opts: { sound?: boolean; haptics?: boolean } = {}) {
  const sound = opts.sound !== false;
  const haptics = opts.haptics !== false;
  if (Platform.OS === "web") {
    if (!sound) return;
    _webChime(0.18);
  } else {
    if (!haptics) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, 220);
  }
}

/**
 * Starts a continuous alarm — rings and vibrates like an alarm clock until
 * the returned stop() function is called.
 *
 * Ringer-switch / silent-mode behaviour (native):
 *   • Audio  → played via expo-av WITHOUT playsInSilentModeIOS, so iOS mutes
 *     it automatically when the ringer switch is off.  Android respects the
 *     device volume / DND mode the same way.
 *   • Vibration → uses Vibration + expo-haptics which both bypass the silent
 *     switch, so the phone always buzzes even in silent / DND mode.
 *
 * Web: repeats the Web Audio chime every 1.5 s (sound pref respected).
 *
 * Always call stop() when the user dismisses the alert.
 */
export function startAlarm(): () => void {
  // ── Web ─────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    _webChime(0.18);
    const id = setInterval(() => _webChime(0.18), 1500);
    return () => clearInterval(id);
  }

  // ── Native ──────────────────────────────────────────────────────────────
  // Vibration bypasses the silent switch — always buzzes on timer end.
  Vibration.vibrate([0, 700, 600], true);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  const hapticsInterval = setInterval(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, 1300);

  return () => {
    clearInterval(hapticsInterval);
    Vibration.cancel();
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _webChime(volume: number) {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playTone = (freq: number, startOffset: number, duration: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = ctx.currentTime + startOffset;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(volume, start + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(start);
      o.stop(start + duration + 0.05);
    };
    playTone(880, 0, 0.7);
    playTone(660, 0.35, 0.9);
  } catch {
    // ignore
  }
}
