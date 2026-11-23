import WebSocket from "ws";
import type { UpstreamState } from "../../../shared/protocol.ts";

/**
 * One combined-stream connection to Binance, with streams added and removed
 * while it is live.
 *
 * The reconnect, pong and 23h-recycle handling is adapted from
 * `fiazsami/trading` `src/feed/binance/BinancePartialDepth.ts`. What is new
 * here is that the set of streams is not fixed at connect time: callers say
 * which streams they WANT, and the connection works toward that set with
 * SUBSCRIBE/UNSUBSCRIBE control messages. Treating it as desired state rather
 * than a queue of commands is what makes reconnects simple, because after a
 * reconnect nothing is live and everything wanted is simply sent again.
 *
 * Binance limits a connection to 5 incoming messages per second, and pings and
 * pongs count toward that. Control messages are therefore spaced at least
 * `controlIntervalMs` apart (250ms by default, so 4/s) and batched. Those
 * limits come from Binance.com's documentation. Binance.US's docs don't state
 * them, so the same limits are assumed.
 */

/** The slice of `ws` this class uses, so tests can supply a fake. */
export interface MinimalSocket {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors ws's own overloads
    on(event: string, listener: (...args: any[]) => void): unknown;
    send(data: string): void;
    pong(data?: unknown): void;
    close(): void;
    terminate(): void;
}

export type SocketFactory = (url: string) => MinimalSocket;

export interface UpstreamOptions {
    /** Combined-stream endpoint without a `streams=` query, e.g. `wss://stream.binance.us:9443/stream`. */
    url: string;
    onMessage: (stream: string, data: unknown) => void;
    onState?: (state: UpstreamState) => void;
    onLog?: (message: string) => void;
    createSocket?: SocketFactory;
    baseDelayMs?: number;
    maxDelayMs?: number;
    /** Binance closes connections at 24h; recycle first, on our own schedule. */
    recycleAfterMs?: number;
    /** Reconnect when nothing at all arrives for this long. The always-on market feed ticks every second. */
    idleTimeoutMs?: number;
    controlIntervalMs?: number;
    maxParamsPerMessage?: number;
    /** Binance's per-connection stream cap. */
    maxStreams?: number;
}

export type UpstreamFrame =
    | { kind: "data"; stream: string; data: unknown }
    | { kind: "ack"; id: number }
    | { kind: "error"; id: number | null; message: string }
    | { kind: "invalid"; reason: string };

/**
 * Pure decode of one upstream frame. Never throws: a malformed frame must not
 * take down the connection every open tab depends on.
 */
export function decodeFrame(raw: string): UpstreamFrame {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return { kind: "invalid", reason: "unparseable" };
    }
    if (typeof value !== "object" || value === null) return { kind: "invalid", reason: "not an object" };
    const msg = value as Record<string, unknown>;

    if (typeof msg.stream === "string" && "data" in msg) {
        return { kind: "data", stream: msg.stream, data: msg.data };
    }

    const id = typeof msg.id === "number" ? msg.id : null;

    // Binance has used both {"error":{"code","msg"},"id"} and {"code","msg","id"}.
    const error = typeof msg.error === "object" && msg.error !== null ? (msg.error as Record<string, unknown>) : null;
    if (error || typeof msg.code === "number") {
        const detail = error ?? msg;
        const text = typeof detail.msg === "string" ? detail.msg : JSON.stringify(detail);
        return { kind: "error", id, message: text };
    }

    if ("result" in msg && id !== null) return { kind: "ack", id };

    return { kind: "invalid", reason: "unrecognised frame" };
}

const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000;

interface Pending {
    method: "SUBSCRIBE" | "UNSUBSCRIBE";
    params: string[];
}

export class BinanceUpstream {
    private readonly url: string;
    private readonly onMessage: (stream: string, data: unknown) => void;
    private readonly onState: (state: UpstreamState) => void;
    private readonly log: (message: string) => void;
    private readonly createSocket: SocketFactory;
    private readonly baseDelayMs: number;
    private readonly maxDelayMs: number;
    private readonly recycleAfterMs: number;
    private readonly idleTimeoutMs: number;
    private readonly controlIntervalMs: number;
    private readonly maxParams: number;
    private readonly maxStreams: number;

    /** What callers want streamed. */
    private readonly wanted = new Set<string>();
    /** What has been subscribed on the current socket. Cleared on every disconnect. */
    private readonly live = new Set<string>();
    private readonly pending = new Map<number, Pending>();

    private socket: MinimalSocket | null = null;
    private isOpen = false;
    private closed = true;
    private attempt = 0;
    private nextId = 1;
    private lastControlAt = Number.NEGATIVE_INFINITY;
    private current: UpstreamState = "connecting";

    private reconnectTimer: NodeJS.Timeout | null = null;
    private recycleTimer: NodeJS.Timeout | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private controlTimer: NodeJS.Timeout | null = null;

    constructor(options: UpstreamOptions) {
        this.url = options.url;
        this.onMessage = options.onMessage;
        this.onState = options.onState ?? (() => {});
        this.log = options.onLog ?? (() => {});
        this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as MinimalSocket);
        this.baseDelayMs = options.baseDelayMs ?? 1_000;
        this.maxDelayMs = options.maxDelayMs ?? 30_000;
        this.recycleAfterMs = options.recycleAfterMs ?? TWENTY_THREE_HOURS;
        this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
        this.controlIntervalMs = options.controlIntervalMs ?? 250;
        this.maxParams = options.maxParamsPerMessage ?? 100;
        this.maxStreams = options.maxStreams ?? 1024;
    }

    start(): void {
        if (!this.closed) return;
        this.closed = false;
        this.connect();
    }

    add(streams: string[]): void {
        for (const stream of streams) {
            if (this.wanted.has(stream)) continue;
            if (this.wanted.size >= this.maxStreams) {
                this.log(`stream cap of ${this.maxStreams} reached; not subscribing ${stream}`);
                continue;
            }
            this.wanted.add(stream);
        }
        this.scheduleFlush();
    }

    remove(streams: string[]): void {
        for (const stream of streams) this.wanted.delete(stream);
        this.scheduleFlush();
    }

    state(): UpstreamState {
        return this.current;
    }

    subscribed(): string[] {
        return [...this.live].sort();
    }

    close(): void {
        this.closed = true;
        this.clearTimers();
        const socket = this.socket;
        this.socket = null;
        this.isOpen = false;
        this.live.clear();
        socket?.close();
        this.setState("closed");
    }

    private setState(state: UpstreamState): void {
        if (state === this.current) return;
        this.current = state;
        this.onState(state);
    }

    private connect(): void {
        if (this.closed) return;
        this.reconnectTimer = null;

        const socket = this.createSocket(this.url);
        this.socket = socket;
        this.isOpen = false;
        this.live.clear();
        this.pending.clear();

        socket.on("open", () => {
            if (socket !== this.socket) return;
            this.isOpen = true;
            this.attempt = 0;
            this.lastControlAt = Number.NEGATIVE_INFINITY;
            this.log(`connected ${this.url}`);
            this.setState("open");
            this.armRecycle(socket);
            this.armIdle(socket);
            this.scheduleFlush();
        });

        // Binance pings and drops connections that fail to answer within a minute.
        socket.on("ping", ((data: unknown) => socket.pong(data)));

        socket.on("message", ((raw: unknown) => {
            if (socket !== this.socket) return;
            this.armIdle(socket);
            this.receive(String(raw));
        }));

        socket.on("error", ((error: Error) => {
            this.log(`socket error: ${error.message}`);
        }));

        socket.on("close", () => {
            if (socket !== this.socket) return;
            this.socket = null;
            this.isOpen = false;
            this.live.clear();
            this.clearTimers();
            if (this.closed) {
                this.setState("closed");
                return;
            }
            const delay = Math.min(this.baseDelayMs * 2 ** this.attempt, this.maxDelayMs);
            this.attempt += 1;
            this.setState("reconnecting");
            this.log(`disconnected; reconnecting in ${delay}ms`);
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
        });
    }

    private receive(raw: string): void {
        const frame = decodeFrame(raw);
        switch (frame.kind) {
            case "data":
                this.onMessage(frame.stream, frame.data);
                return;
            case "ack":
                this.pending.delete(frame.id);
                return;
            case "error": {
                const request = frame.id === null ? undefined : this.pending.get(frame.id);
                if (frame.id !== null) this.pending.delete(frame.id);
                this.log(`${request ? `${request.method} ${request.params.join(",")}` : "request"} rejected: ${frame.message}`);
                // Stop wanting what Binance refused, or every flush would resend it forever.
                if (request?.method === "SUBSCRIBE") {
                    for (const stream of request.params) {
                        this.live.delete(stream);
                        this.wanted.delete(stream);
                    }
                }
                return;
            }
            case "invalid":
                this.log(`dropped frame: ${frame.reason}`);
                return;
        }
    }

    private scheduleFlush(): void {
        if (!this.isOpen || this.controlTimer !== null) return;
        const wait = Math.max(0, this.lastControlAt + this.controlIntervalMs - Date.now());
        this.controlTimer = setTimeout(() => this.flush(), wait);
    }

    /** Sends at most one control message, then reschedules if more remain. */
    private flush(): void {
        this.controlTimer = null;
        if (!this.isOpen || !this.socket) return;

        const toRemove = [...this.live].filter((s) => !this.wanted.has(s));
        const toAdd = [...this.wanted].filter((s) => !this.live.has(s));

        // Unsubscribe first, so a full connection makes room before adding.
        if (toRemove.length > 0) {
            const params = toRemove.slice(0, this.maxParams);
            for (const stream of params) this.live.delete(stream);
            this.send({ method: "UNSUBSCRIBE", params });
        } else if (toAdd.length > 0) {
            const params = toAdd.slice(0, this.maxParams);
            for (const stream of params) this.live.add(stream);
            this.send({ method: "SUBSCRIBE", params });
        } else {
            return;
        }

        this.lastControlAt = Date.now();
        this.scheduleFlush();
    }

    private send(request: Pending): void {
        const id = this.nextId++;
        this.pending.set(id, request);
        this.socket?.send(JSON.stringify({ method: request.method, params: request.params, id }));
    }

    private armRecycle(socket: MinimalSocket): void {
        if (this.recycleTimer !== null) clearTimeout(this.recycleTimer);
        this.recycleTimer = setTimeout(() => {
            this.log("recycling connection before Binance's 24h cutoff");
            socket.close();
        }, this.recycleAfterMs);
    }

    private armIdle(socket: MinimalSocket): void {
        if (this.idleTimer !== null) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this.log(`no data for ${this.idleTimeoutMs}ms; dropping the connection`);
            socket.terminate();
        }, this.idleTimeoutMs);
    }

    private clearTimers(): void {
        for (const timer of [this.reconnectTimer, this.recycleTimer, this.idleTimer, this.controlTimer]) {
            if (timer !== null) clearTimeout(timer);
        }
        this.reconnectTimer = this.recycleTimer = this.idleTimer = this.controlTimer = null;
    }
}
