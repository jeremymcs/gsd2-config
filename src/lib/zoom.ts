// GSD2 Config - Persistent webview zoom
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const STORAGE_KEY = "gsd2-config.webview-zoom";
const DEFAULT_ZOOM = 1;
const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 10;

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
}

function clampZoom(value: number): number {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  return Number(clamped.toFixed(2));
}

function loadStoredZoom(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ZOOM;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampZoom(parsed) : DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}

function saveStoredZoom(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore storage failures; zoom should still work for this session
  }
}

async function applyWebviewZoom(value: number): Promise<void> {
  await getCurrentWebview().setZoom(value);
}

function zoomDeltaForKey(ev: KeyboardEvent): number | null {
  const hasMod = isMac() ? ev.metaKey : ev.ctrlKey;
  if (!hasMod || ev.altKey) return null;

  if (ev.key === "+" || ev.key === "=") return ZOOM_STEP;
  if (ev.key === "-" || ev.key === "_") return -ZOOM_STEP;
  if (ev.key === "0") return 0;

  return null;
}

export function usePersistentWebviewZoom(): void {
  const zoomRef = useRef(DEFAULT_ZOOM);

  useEffect(() => {
    const initialZoom = loadStoredZoom();
    zoomRef.current = initialZoom;
    void applyWebviewZoom(initialZoom).catch(() => {
      // Browser-only dev sessions do not have a Tauri webview.
    });

    function onKeyDown(ev: KeyboardEvent) {
      const delta = zoomDeltaForKey(ev);
      if (delta === null) return;

      ev.preventDefault();
      ev.stopPropagation();

      const nextZoom = delta === 0 ? DEFAULT_ZOOM : clampZoom(zoomRef.current + delta);
      zoomRef.current = nextZoom;
      saveStoredZoom(nextZoom);
      void applyWebviewZoom(nextZoom).catch(() => {
        // Keep the stored value; it will apply the next time a Tauri webview is available.
      });
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
