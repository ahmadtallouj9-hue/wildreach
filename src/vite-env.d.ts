/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public HTTPS origin for share links (e.g. https://wildreach-game.surge.sh). */
  readonly VITE_PUBLIC_URL?: string;
  /** WebSocket URL for multiplayer / friends (e.g. wss://wildreach-mp.onrender.com). */
  readonly VITE_MP_URL?: string;
  /** Override Wildreach Studio AI endpoint. */
  readonly VITE_STUDIO_AI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
