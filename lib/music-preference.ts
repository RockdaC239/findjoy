"use client";

import { useSyncExternalStore } from "react";

const MUSIC_PREFERENCE_KEY = "findjoy:music-enabled";
const MUSIC_PREFERENCE_EVENT = "findjoy:music-preference";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(MUSIC_PREFERENCE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(MUSIC_PREFERENCE_EVENT, callback);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

/** 背景音乐偏好：默认开启，关闭后跨刷新记住。 */
export function useMusicEnabledPreference(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setMusicEnabledPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(MUSIC_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(MUSIC_PREFERENCE_EVENT));
}
