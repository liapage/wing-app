import type { Message } from "@/lib/wingd";

export type ChatMessage = Message & {
    localId?: string;
    status?: "sending" | "failed";
};

export type SocketStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

const MAX_MESSAGES_PER_CHAT = 400;
const EMPTY_MESSAGES: ChatMessage[] = [];

function timeOf(message: ChatMessage): number {
    const time = Date.parse(message.created_at);
    return Number.isNaN(time) ? 0 : time;
}

function compareMessages(a: ChatMessage, b: ChatMessage): number {
    const delta = timeOf(a) - timeOf(b);
    if (delta !== 0) return delta;

    return a.id.localeCompare(b.id);
}

type MergeOptions = {
    trim?: boolean;
};

// App-wide message cache. A single instance lives in MessagingProvider; screens
// read from it through useMessagingStore instead of owning their own copies.
export class MessagingStore {
    private messagesByChat = new Map<string, ChatMessage[]>();
    private unreadByChat = new Map<string, number>();
    private activeChatId: string | null = null;
    private status: SocketStatus = "idle";
    private resyncVersion = 0;
    private epoch = 0;
    private version = 0;
    private listeners = new Set<() => void>();

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    getSnapshot = () => this.version;

    getServerSnapshot = () => 0;

    private notify() {
        this.version += 1;

        for (const listener of Array.from(this.listeners)) {
            listener();
        }
    }

    getMessages(chatId: string): ChatMessage[] {
        return this.messagesByChat.get(chatId) ?? EMPTY_MESSAGES;
    }

    getLastMessage(chatId: string): ChatMessage | undefined {
        const messages = this.messagesByChat.get(chatId);
        return messages?.[messages.length - 1];
    }

    getUnread(chatId: string): number {
        return this.unreadByChat.get(chatId) ?? 0;
    }

    getActiveChatId(): string | null {
        return this.activeChatId;
    }

    getConnectionStatus(): SocketStatus {
        return this.status;
    }

    getResyncVersion(): number {
        return this.resyncVersion;
    }

    // Bumped whenever the cache is cleared, so in-flight sends can avoid
    // writing into a different session's store.
    getEpoch(): number {
        return this.epoch;
    }

    private mergeInto(chatId: string, incoming: ChatMessage[], { trim = true }: MergeOptions = {}) {
        if (incoming.length === 0) return;

        const current = this.messagesByChat.get(chatId) ?? [];
        const byId = new Map<string, ChatMessage>();

        for (const message of current) {
            byId.set(message.id, message);
        }

        for (const message of incoming) {
            // Server ids are canonical; optimistic messages use their local id
            // as `id`, so they never collide with a saved message.
            byId.set(message.id, message);
        }

        let next = Array.from(byId.values()).sort(compareMessages);
        if (trim && next.length > MAX_MESSAGES_PER_CHAT) {
            // Keep optimistic sends even when trimming old history.
            const local = next.filter((message) => message.localId);
            const server = next.filter((message) => !message.localId);
            next = [...server.slice(-MAX_MESSAGES_PER_CHAT), ...local].sort(compareMessages);
        }

        this.messagesByChat.set(chatId, next);
    }

    mergeMessages(chatId: string, messages: Message[], options?: MergeOptions) {
        if (messages.length === 0) return;

        this.mergeInto(chatId, messages, options);
        this.notify();
    }

    mergeOlderMessages(chatId: string, messages: Message[]) {
        if (messages.length === 0) return;

        this.mergeInto(chatId, messages, { trim: false });
        this.notify();
    }

    // A live event from the socket. Historical pages use mergeMessages instead
    // so backfills never bump unread counts.
    receiveLive(message: Message, meId: string) {
        const current = this.messagesByChat.get(message.chat_id) ?? [];
        if (current.some((item) => item.id === message.id)) return;

        this.mergeInto(message.chat_id, [message]);

        const isForMe = message.sender_id !== meId;
        if (message.chat_id !== this.activeChatId && isForMe) {
            this.unreadByChat.set(
                message.chat_id,
                (this.unreadByChat.get(message.chat_id) ?? 0) + 1,
            );
        }

        this.notify();
    }

    addOutgoing(chatId: string, message: ChatMessage) {
        this.mergeInto(chatId, [message]);
        this.notify();
    }

    confirmOutgoing(chatId: string, localId: string, saved: Message) {
        const current = this.messagesByChat.get(chatId) ?? [];
        const next = current.filter(
            (message) => message.localId !== localId && message.id !== saved.id,
        );
        next.push(saved);

        this.messagesByChat.set(chatId, next.sort(compareMessages));
        this.notify();
    }

    failOutgoing(chatId: string, localId: string) {
        const current = this.messagesByChat.get(chatId) ?? [];
        let changed = false;

        const next = current.map((message) => {
            if (message.localId !== localId || message.status === "failed") return message;

            changed = true;
            return { ...message, status: "failed" as const };
        });

        if (!changed) return;

        this.messagesByChat.set(chatId, next);
        this.notify();
    }

    findOutgoing(chatId: string, localId: string): ChatMessage | undefined {
        return this.getMessages(chatId).find((message) => message.localId === localId);
    }

    markRead(chatId: string) {
        if (!this.unreadByChat.delete(chatId)) return;

        this.notify();
    }

    setActiveChat(chatId: string | null) {
        const hadUnread = chatId ? (this.unreadByChat.get(chatId) ?? 0) > 0 : false;
        const changed = this.activeChatId !== chatId || hadUnread;

        this.activeChatId = chatId;
        if (chatId) this.unreadByChat.delete(chatId);

        if (changed) this.notify();
    }

    setConnectionStatus(status: SocketStatus) {
        if (this.status === status) return;

        this.status = status;
        this.notify();
    }

    // Called after a reconnection so open screens can fill any gap using the
    // server's `after` cursor.
    bumpResync() {
        this.resyncVersion += 1;
        this.notify();
    }

    reset() {
        this.epoch += 1;
        this.messagesByChat.clear();
        this.unreadByChat.clear();
        this.activeChatId = null;
        this.resyncVersion = 0;
        this.status = "idle";
        this.notify();
    }
}
