/** Default public game URL (Vercel production). Override with VITE_PUBLIC_URL. */
export const DEFAULT_PUBLIC_ORIGIN = 'https://wildreach-peach.vercel.app';

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

/** Origin used in share links — never localhost so friends can open them. */
export function publicGameOrigin(): string {
  const env = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (env?.trim()) return env.trim().replace(/\/$/, '');

  if (typeof location === 'undefined') return DEFAULT_PUBLIC_ORIGIN;
  if (isLocalHost(location.hostname)) return DEFAULT_PUBLIC_ORIGIN;
  return location.origin;
}

/** Pathname for share links (usually `/`). */
export function publicGamePath(): string {
  if (typeof location === 'undefined') return '/';
  const path = location.pathname || '/';
  return path.endsWith('/') ? path : `${path}/`;
}
