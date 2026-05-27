function resolveWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  if (typeof window === "undefined") return "ws://localhost:8000/api/v1/ws/alerts";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:8000/api/v1/ws/alerts`;
}

export const ENV = {
  get wsUrl() {
    return resolveWsUrl();
  },
};
