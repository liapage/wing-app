import { useCallback, useEffect, useRef, useState } from "react";

import {
    fetchChatMessages,
    sendChatMessage,
    WingdApiError,
} from "@/lib/wingd";
import { useMessagingStore } from "@/messaging/MessagingProvider";
import type { ChatMessage } from "@/messaging/store";

export type { ChatMessage } from "@/messaging/store";

const PAGE_SIZE = 50;
const MAX_SYNC_PAGES = 20;

let localMessageCounter = 0;

type UseChatMessagesOptions = {
    meId: string;
    onUnauthorized?: () => void;
};

function isUnauthorized(err: unknown): boolean {
    return err instanceof WingdApiError && err.status === 401;
}

function newestServerMessage(messages: ChatMessage[]): ChatMessage | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (!message.localId) return message;
    }

    return undefined;
}

function oldestServerMessage(messages: ChatMessage[]): ChatMessage | undefined {
    return messages.find((message) => !message.localId);
}

export function useChatMessages(
    chatId: string,
    { meId, onUnauthorized }: UseChatMessagesOptions,
) {
    const store = useMessagingStore();
    const messages = store.getMessages(chatId);

    const [loading, setLoading] = useState(() => store.getMessages(chatId).length === 0);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [olderError, setOlderError] = useState<string | null>(null);

    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const loadingOlderRef = useRef(false);
    const loadedRef = useRef(false);
    const onUnauthorizedRef = useRef(onUnauthorized);
    const resyncVersion = store.getResyncVersion();
    const lastResyncRef = useRef(resyncVersion);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        onUnauthorizedRef.current = onUnauthorized;
    }, [onUnauthorized]);

    const handleUnauthorized = useCallback(() => {
        onUnauthorizedRef.current?.();
    }, []);

    const catchUp = useCallback(async () => {
        let newest = newestServerMessage(store.getMessages(chatId));
        if (!newest) return;

        for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
            const result = await fetchChatMessages(chatId, {
                after: newest.id,
                limit: PAGE_SIZE,
            });
            if (!mountedRef.current) return;

            store.mergeMessages(chatId, result.messages);
            if (!result.hasMore) return;

            const next = newestServerMessage(store.getMessages(chatId));
            if (!next || next.id === newest.id) return;
            newest = next;
        }
    }, [chatId, store]);

    const load = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        const firstLoad = !loadedRef.current;
        const cached = store.getMessages(chatId);
        const hasCache = cached.length > 0;

        if (!hasCache) setLoading(true);
        setError(null);

        try {
            if (hasCache) {
                // Re-entering a chat: fill the gap since the newest cached
                // message, then (once) refresh the latest page to establish
                // where the older-history boundary is.
                try {
                    await catchUp();
                } catch (err) {
                    if (isUnauthorized(err)) {
                        handleUnauthorized();
                        return;
                    }
                }

                if (!mountedRef.current || requestId !== requestIdRef.current) return;

                if (firstLoad) {
                    const page = await fetchChatMessages(chatId, { limit: PAGE_SIZE });
                    if (!mountedRef.current || requestId !== requestIdRef.current) return;

                    store.mergeMessages(chatId, page.messages);
                    setHasMore(page.hasMore);
                }
            } else {
                const page = await fetchChatMessages(chatId, { limit: PAGE_SIZE });
                if (!mountedRef.current || requestId !== requestIdRef.current) return;

                store.mergeMessages(chatId, page.messages);
                setHasMore(page.hasMore);
            }

            loadedRef.current = true;
        } catch (err) {
            if (!mountedRef.current || requestId !== requestIdRef.current) return;

            if (isUnauthorized(err)) {
                handleUnauthorized();
                return;
            }

            if (!hasCache) setError("Couldn't load messages.");
        } finally {
            if (mountedRef.current && requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [catchUp, chatId, handleUnauthorized, store]);

    useEffect(() => {
        void load();

        return () => {
            requestIdRef.current += 1;
        };
    }, [load]);

    // The socket reconnected. Pull anything that arrived while it was down.
    useEffect(() => {
        if (resyncVersion === lastResyncRef.current) return;
        lastResyncRef.current = resyncVersion;

        void catchUp().catch((err: unknown) => {
            if (!mountedRef.current) return;
            if (isUnauthorized(err)) handleUnauthorized();
        });
    }, [catchUp, handleUnauthorized, resyncVersion]);

    const loadOlder = useCallback(async () => {
        if (loading || loadingOlderRef.current || !hasMore) return;

        const oldest = oldestServerMessage(store.getMessages(chatId));
        if (!oldest) {
            setHasMore(false);
            return;
        }

        loadingOlderRef.current = true;
        setLoadingOlder(true);
        setOlderError(null);

        try {
            const page = await fetchChatMessages(chatId, {
                before: oldest.id,
                limit: PAGE_SIZE,
            });
            if (!mountedRef.current) return;

            store.mergeOlderMessages(chatId, page.messages);
            setHasMore(page.hasMore);
        } catch (err) {
            if (!mountedRef.current) return;

            if (isUnauthorized(err)) {
                handleUnauthorized();
                return;
            }

            setOlderError("Couldn't load earlier messages.");
        } finally {
            if (mountedRef.current) {
                loadingOlderRef.current = false;
                setLoadingOlder(false);
            }
        }
    }, [chatId, handleUnauthorized, hasMore, loading, store]);

    const deliver = useCallback(
        async (localId: string, text: string) => {
            const epoch = store.getEpoch();

            try {
                const saved = await sendChatMessage(chatId, text);
                if (store.getEpoch() !== epoch) return;

                // Reconcile even if the screen was left while the request was
                // in flight; the store is app-wide now.
                store.confirmOutgoing(chatId, localId, saved);
            } catch (err) {
                if (store.getEpoch() !== epoch) return;

                if (isUnauthorized(err)) handleUnauthorized();

                store.failOutgoing(chatId, localId);
            }
        },
        [chatId, handleUnauthorized, store],
    );

    const send = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;

            const localId = `local-${Date.now()}-${++localMessageCounter}`;
            const optimistic: ChatMessage = {
                id: localId,
                localId,
                chat_id: chatId,
                sender_id: meId,
                text: trimmed,
                data: null,
                created_at: new Date().toISOString(),
                status: "sending",
            };

            store.addOutgoing(chatId, optimistic);
            await deliver(localId, trimmed);
        },
        [chatId, deliver, meId, store],
    );

    const retry = useCallback(
        (localId: string) => {
            const message = store.findOutgoing(chatId, localId);
            if (!message || message.status !== "failed") return;

            store.addOutgoing(chatId, { ...message, status: "sending" });
            void deliver(localId, message.text);
        },
        [chatId, deliver, store],
    );

    return {
        messages,
        loading,
        error,
        hasMore,
        loadingOlder,
        olderError,
        load,
        loadOlder,
        send,
        retry,
    };
}
