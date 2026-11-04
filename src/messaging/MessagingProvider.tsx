import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { getAccessToken, wingdUrl, type Message } from "@/lib/wingd";
import { MessagingStore } from "@/messaging/store";

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];

const MessagingContext = createContext<MessagingStore | null>(null);

type NativeWebSocketConstructor = new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
) => WebSocket;

function socketUrl(token: string): string {
    const base =
        wingdUrl ||
        (Platform.OS === "web" ? window.location.origin : "https://wing.lia.page");
    const httpUrl = `${base.replace(/\/$/, "")}/api/ws`;

    if (Platform.OS !== "web") {
        return httpUrl.replace(/^http/, "ws");
    }

    // Browsers cannot attach an Authorization header to a WebSocket handshake,
    // so web passes the session token as a query parameter instead.
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("access_token", token);

    return url.toString();
}

function openSocket(token: string): WebSocket {
    const url = socketUrl(token);

    if (Platform.OS === "web") {
        return new WebSocket(url);
    }

    // React Native's WebSocket accepts headers as a third argument.
    const Constructor = WebSocket as unknown as NativeWebSocketConstructor;
    return new Constructor(url, undefined, {
        headers: { Authorization: `Bearer ${token}` },
    });
}

function parseMessageEvent(raw: unknown): Message | null {
    if (typeof raw !== "string") return null;

    try {
        const event = JSON.parse(raw) as {
            type?: unknown;
            chat_id?: unknown;
            data?: unknown;
        };

        if (event.type !== "message.created") return null;

        const data = event.data as Partial<Message> | null | undefined;
        if (
            !data ||
            typeof data.id !== "string" ||
            typeof data.chat_id !== "string" ||
            typeof data.sender_id !== "string" && data.sender_id !== null ||
            typeof data.text !== "string" ||
            typeof data.created_at !== "string"
        ) {
            return null;
        }

        return {
            id: data.id,
            chat_id: data.chat_id,
            sender_id: data.sender_id ?? null,
            text: data.text,
            data: typeof data.data === "string" ? data.data : null,
            created_at: data.created_at,
        };
    } catch {
        return null;
    }
}

// Owns the app's single WebSocket. Screens never open sockets themselves; they
// subscribe to the store that this provider feeds.
function useMessageSocket(store: MessagingStore, meId: string | null) {
    useEffect(() => {
        if (!meId) {
            store.setConnectionStatus("idle");
            return;
        }

        let disposed = false;
        let socket: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;
        let connecting = false;
        let hasConnected = false;

        const clearRetry = () => {
            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }
        };

        const scheduleReconnect = () => {
            if (disposed) return;

            clearRetry();
            store.setConnectionStatus("reconnecting");

            const delay =
                RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] +
                Math.round(Math.random() * 500);
            attempt += 1;

            retryTimer = setTimeout(() => {
                retryTimer = null;
                void connect();
            }, delay);
        };

        const connect = async (): Promise<void> => {
            if (disposed || connecting || socket) return;

            connecting = true;
            clearRetry();
            store.setConnectionStatus(hasConnected ? "reconnecting" : "connecting");

            let token: string | null = null;
            try {
                token = await getAccessToken();
            } catch {
                token = null;
            }

            if (disposed) {
                connecting = false;
                return;
            }

            if (!token) {
                connecting = false;
                store.setConnectionStatus("closed");
                return;
            }

            let next: WebSocket;
            try {
                next = openSocket(token);
            } catch {
                connecting = false;
                scheduleReconnect();
                return;
            }

            connecting = false;
            socket = next;

            next.onopen = () => {
                if (disposed || socket !== next) return;

                attempt = 0;
                hasConnected = true;
                store.setConnectionStatus("open");
                // Let open screens fill any gap that happened while offline.
                store.bumpResync();
            };

            next.onmessage = (event) => {
                if (disposed || socket !== next) return;

                const message = parseMessageEvent(event.data);
                if (message) store.receiveLive(message, meId);
            };

            next.onerror = () => {
                // `onclose` always follows; reconnection is handled there.
            };

            next.onclose = () => {
                if (socket === next) socket = null;
                if (disposed) return;

                scheduleReconnect();
            };
        };

        store.setConnectionStatus("connecting");
        void connect();

        const appStateSubscription = AppState.addEventListener("change", (state) => {
            if (state === "active" && !socket && !retryTimer && !connecting) {
                attempt = 0;
                void connect();
            }
        });

        return () => {
            disposed = true;
            clearRetry();
            appStateSubscription.remove();

            const current = socket;
            socket = null;

            if (current) {
                current.onopen = null;
                current.onmessage = null;
                current.onerror = null;
                current.onclose = null;

                try {
                    current.close(1000, "app closed");
                } catch {
                    // Already closed.
                }
            }

            store.setConnectionStatus("closed");
        };
    }, [meId, store]);
}

export function MessagingProvider({ children }: { children: ReactNode }) {
    const [store] = useState(() => new MessagingStore());
    const auth = useAuth();
    const meId = auth.status === "authenticated" ? auth.me.id : null;
    const previousMeId = useRef<string | null>(null);

    useEffect(() => {
        if (previousMeId.current === meId) return;

        // Never leak one account's cached messages into another session.
        store.reset();
        previousMeId.current = meId;
    }, [meId, store]);

    useMessageSocket(store, meId);

    return <MessagingContext.Provider value={store}>{children}</MessagingContext.Provider>;
}

export function useMessagingStore(): MessagingStore {
    const store = useContext(MessagingContext);
    if (!store) throw new Error("useMessagingStore must be used inside MessagingProvider");

    useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

    return store;
}
