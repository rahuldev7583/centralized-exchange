import { getToken } from "./api";

type Listener = (data: unknown) => void;

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL as string) || "ws://localhost:8080";

interface ChannelHandlers {
  [channel: string]: Set<Listener>;
}

class WsClient {
  private ws: WebSocket | null = null;
  private handlers: ChannelHandlers = {};
  private shouldReconnect = true;
  private reconnectDelay = 1500;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingChannels = new Set<string>();

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.shouldReconnect = true;

    const token = getToken();
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.pendingChannels.forEach((channel) => this.sendSubscribe(channel));
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ channel: "_ping" }));
        }
      }, 20000);
    };

    this.ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      if (parsed && typeof parsed === "object") {
        const msg = parsed as { channel?: unknown; data?: unknown };
        if (typeof msg.channel === "string") {
          const set = this.handlers[msg.channel];
          if (set) {
            set.forEach((fn) => fn(msg.data ?? parsed));
          }
        }
      }
    };

    this.ws.onerror = () => {
      /* ignore, onclose will handle reconnect */
    };

    this.ws.onclose = () => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(channel: string, listener: Listener): () => void {
    if (!this.handlers[channel]) this.handlers[channel] = new Set();
    this.handlers[channel].add(listener);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(channel);
    } else {
      this.pendingChannels.add(channel);
      this.connect();
    }

    return () => {
      this.handlers[channel]?.delete(listener);
      if (this.handlers[channel]?.size === 0) {
        delete this.handlers[channel];
        this.pendingChannels.delete(channel);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.sendUnsubscribe(channel);
        }
      }
    };
  }

  private sendSubscribe(channel: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ channel, type: "subscribe" }));
    }
  }

  private sendUnsubscribe(channel: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ channel, type: "unsubscribe" }));
    }
  }
}

export const wsClient = new WsClient();