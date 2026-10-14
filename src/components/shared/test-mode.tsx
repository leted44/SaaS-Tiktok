"use client";

import { useSyncExternalStore } from "react";

/**
 * The admin's « Mode test »: one switch, off by default, that shows or hides
 * every admin test (image model picker, « Mon clone », brief rewriting,
 * « Copier la description », text drawn into the slide, the writing review).
 * Off, the admin sees the app exactly as a client does and generates with the
 * clients' image model. Remembered on this device; every open component
 * follows a change at once.
 */

const KEY = "vs-test-mode";
const EVENT = "vs-test-mode-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setTestMode(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Not remembered; the event still switches the open page.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether the test features show: only for an admin account, and only while the switch is on. */
export function useTestMode(admin: boolean): boolean {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return admin && on;
}
