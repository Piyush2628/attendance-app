"use client";

import { useEffect, useSyncExternalStore } from "react";

/* ---------- Install prompt ---------------------------------------------------
 * Chrome/Edge/Samsung fire `beforeinstallprompt` once, often right after load.
 * Listen at module load (before React hydrates) so the event is never missed.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button
    deferredPrompt = e as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedNow = true;
    notifyInstall();
  });
}

function subscribeInstall(listener: () => void) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

export function useInstallPrompt() {
  return useSyncExternalStore(
    subscribeInstall,
    () => deferredPrompt,
    () => null,
  );
}

/** Shows the browser's install dialog. Returns true if the user accepted. */
export async function promptInstall() {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") installedNow = true;
  notifyInstall();
  return outcome === "accepted";
}

/* ---------- Running as an installed app? ------------------------------------ */

const STANDALONE = "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)";

function subscribeDisplayMode(listener: () => void) {
  const mq = window.matchMedia(STANDALONE);
  mq.addEventListener("change", listener);
  const unsub = subscribeInstall(listener);
  return () => {
    mq.removeEventListener("change", listener);
    unsub();
  };
}

function isInstalled() {
  return (
    installedNow ||
    window.matchMedia(STANDALONE).matches ||
    // iOS Safari home-screen apps
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** true when opened from the home screen (or just installed). Assumes installed during SSR to avoid a flash. */
export function useIsInstalled() {
  return useSyncExternalStore(subscribeDisplayMode, isInstalled, () => true);
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

const noop = () => () => {};
export function useIsIos() {
  return useSyncExternalStore(noop, isIos, () => false);
}

/* ---------- Online / offline ------------------------------------------------- */

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/* ---------- Keep the screen on (kiosk tablets) ------------------------------- */

/** Holds a screen wake lock while mounted; re-acquired when the tab becomes visible again. */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;

    async function acquire() {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const l = await navigator.wakeLock.request("screen");
        if (active) lock = l;
        else l.release().catch(() => {});
      } catch {
        // Battery saver or no permission: the screen just sleeps as usual.
      }
    }

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}
