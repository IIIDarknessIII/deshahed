function resolveWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  if (typeof window === "undefined") return "ws://localhost:8000/api/v1/ws/alerts";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  // Dev: frontend on :3000, backend on :8000, same machine.
  // Prod: frontend on de-shahed.online, backend on api.de-shahed.online — both via cloudflared on 443.
  if (host === "localhost" || host === "127.0.0.1") {
    return `${proto}//${host}:8000/api/v1/ws/alerts`;
  }
  return `${proto}//api.${host}/api/v1/ws/alerts`;
}

export const ENV = {
  get wsUrl() {
    return resolveWsUrl();
  },
};
