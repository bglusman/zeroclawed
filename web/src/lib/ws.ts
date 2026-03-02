import type { WsMessage } from '../types/api';
import { getToken } from './auth';
import { isMockModeEnabled } from './mockMode';

export type WsMessageHandler = (msg: WsMessage) => void;
export type WsOpenHandler = () => void;
export type WsCloseHandler = (ev: CloseEvent) => void;
export type WsErrorHandler = (ev: Event) => void;

export interface WebSocketClientOptions {
  /** Base URL override. Defaults to current host with ws(s) protocol. */
  baseUrl?: string;
  /** Delay in ms before attempting reconnect. Doubles on each failure up to maxReconnectDelay. */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms. */
  maxReconnectDelay?: number;
  /** Set to false to disable auto-reconnect. Default true. */
  autoReconnect?: boolean;
}

const DEFAULT_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const WS_SESSION_STORAGE_KEY = 'zeroclaw.ws.session_id';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private currentDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mockTimers: Array<ReturnType<typeof setTimeout>> = [];
  private mockConnected = false;
  private intentionallyClosed = false;

  public onMessage: WsMessageHandler | null = null;
  public onOpen: WsOpenHandler | null = null;
  public onClose: WsCloseHandler | null = null;
  public onError: WsErrorHandler | null = null;

  private readonly baseUrl: string;
  private readonly reconnectDelay: number;
  private readonly maxReconnectDelay: number;
  private readonly autoReconnect: boolean;
  private readonly sessionId: string;

  constructor(options: WebSocketClientOptions = {}) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.baseUrl =
      options.baseUrl ?? `${protocol}//${window.location.host}`;
    this.reconnectDelay = options.reconnectDelay ?? DEFAULT_RECONNECT_DELAY;
    this.maxReconnectDelay = options.maxReconnectDelay ?? MAX_RECONNECT_DELAY;
    this.autoReconnect = options.autoReconnect ?? true;
    this.currentDelay = this.reconnectDelay;
    this.sessionId = this.resolveSessionId();
  }

  /** Open the WebSocket connection. */
  connect(): void {
    this.intentionallyClosed = false;
    this.clearReconnectTimer();

    if (isMockModeEnabled()) {
      this.mockConnect();
      return;
    }

    const token = getToken();
    const url = `${this.baseUrl}/ws/chat?session_id=${encodeURIComponent(this.sessionId)}`;
    const protocols = ['zeroclaw.v1'];
    if (token) {
      protocols.push(`bearer.${token}`);
    }

    this.ws = new WebSocket(url, protocols);

    this.ws.onopen = () => {
      this.currentDelay = this.reconnectDelay;
      this.onOpen?.();
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        this.onMessage?.(msg);
      } catch {
        // Ignore non-JSON frames
      }
    };

    this.ws.onclose = (ev: CloseEvent) => {
      this.onClose?.(ev);
      this.scheduleReconnect();
    };

    this.ws.onerror = (ev: Event) => {
      this.onError?.(ev);
    };
  }

  /** Send a chat message to the agent. */
  sendMessage(content: string): void {
    if (isMockModeEnabled()) {
      if (!this.mockConnected) {
        throw new Error('Mock WebSocket is not connected');
      }

      this.pushMockTimer(
        setTimeout(() => {
          this.onMessage?.({
            type: 'chunk',
            content: 'Mock runtime: analyzing request...',
          });
        }, 220),
      );
      this.pushMockTimer(
        setTimeout(() => {
          this.onMessage?.({
            type: 'done',
            full_response: `Mock response generated for: "${content}"`,
          });
        }, 780),
      );
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify({ type: 'message', content }));
  }

  /** Close the connection without auto-reconnecting. */
  disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.clearMockTimers();
    this.mockConnected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Returns true if the socket is open. */
  get connected(): boolean {
    if (isMockModeEnabled()) {
      return this.mockConnected;
    }
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ---------------------------------------------------------------------------
  // Reconnection logic
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || !this.autoReconnect) return;

    this.reconnectTimer = setTimeout(() => {
      this.currentDelay = Math.min(this.currentDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.currentDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private mockConnect(): void {
    this.clearMockTimers();
    this.mockConnected = true;
    this.currentDelay = this.reconnectDelay;

    this.pushMockTimer(
      setTimeout(() => {
        this.onOpen?.();
        this.onMessage?.({
          type: 'history',
          messages: [
            {
              role: 'assistant',
              content: 'Mock mode connected. This chat is running without a backend.',
            },
          ],
        });
      }, 80),
    );
  }

  private pushMockTimer(timer: ReturnType<typeof setTimeout>): void {
    this.mockTimers.push(timer);
  }

  private clearMockTimers(): void {
    for (const timer of this.mockTimers) {
      clearTimeout(timer);
    }
    this.mockTimers = [];
  }

  private resolveSessionId(): string {
    const existing = window.localStorage.getItem(WS_SESSION_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{1,128}$/.test(existing)) {
      return existing;
    }

    const generated =
      globalThis.crypto?.randomUUID?.().replace(/-/g, '_') ??
      `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(WS_SESSION_STORAGE_KEY, generated);
    return generated;
  }
}
