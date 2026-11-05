import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Avatar from "@/components/Avatar";
import { useAuth } from "@/auth/AuthProvider";
import { fetchChats, WingdApiError, type Chat, type Me } from "@/lib/wingd";
import { markdownToPlainText } from "@/markdown/parse";
import { useMessagingStore } from "@/messaging/MessagingProvider";
import type { ChatMessage } from "@/messaging/store";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

type ChatsScreenProps = {
    me: Me;
};

function otherMembers(chat: Chat, meId: string) {
    return (chat.members ?? []).filter((member) => member.user.id !== meId);
}

function chatTitle(chat: Chat, meId: string): string {
    const title = (chat.title ?? "").trim();
    if (title) return title;

    const names = otherMembers(chat, meId)
        .map((member) => member.user.display_name)
        .filter(Boolean);

    return names.join(", ") || "New conversation";
}

function chatPreview(chat: Chat): string {
    const count = Math.max(chat.members?.length ?? 0, 1);

    return count > 2 ? `${count} people` : "No messages yet";
}

function lastMessagePreview(message: ChatMessage, meId: string): string {
    const text = markdownToPlainText(message.text);
    if (!text) return "New message";

    return message.sender_id === meId ? `You: ${text}` : text;
}

function formatChatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return "";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysAgo = Math.round(
        (startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysAgo === 0) {
        return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo > 1 && daysAgo < 7) {
        return date.toLocaleDateString(undefined, { weekday: "short" });
    }
    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function ChatsScreen({ me }: ChatsScreenProps) {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { refresh: refreshSession } = useAuth();
    const store = useMessagingStore();

    const [chats, setChats] = useState<Chat[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    const resyncVersion = store.getResyncVersion();
    const lastResyncRef = useRef(resyncVersion);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        };
    }, []);

    const load = useCallback(
        async (mode: "initial" | "refresh" | "silent" = "initial") => {
            if (mode === "refresh") {
                setRefreshing(true);
            } else if (mode === "initial") {
                setLoading(true);
            }
            setError(null);

            try {
                const nextChats = await fetchChats();
                if (mounted.current) setChats(nextChats);
            } catch (err) {
                if (!mounted.current) return;

                if (err instanceof WingdApiError && err.status === 401) {
                    await refreshSession();
                    return;
                }

                if (mode !== "silent") setError("Couldn't load your conversations.");
            } finally {
                if (mounted.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [refreshSession],
    );

    useEffect(() => {
        void load();
    }, [load]);

    // On reconnect, refresh the list so chats created or renamed while offline
    // show up. Live message updates themselves come from the store.
    useEffect(() => {
        if (resyncVersion === lastResyncRef.current) return;
        lastResyncRef.current = resyncVersion;

        void load("silent");
    }, [load, resyncVersion]);

    const activityTime = useCallback(
        (chat: Chat) => {
            const last = store.getLastMessage(chat.id);
            const time = Date.parse(last?.created_at ?? chat.created_at);
            return Number.isNaN(time) ? 0 : time;
        },
        [store],
    );

    const filteredChats = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return chats;

        return chats.filter((chat) => {
            const haystack = [
                chatTitle(chat, me.id),
                ...(chat.members ?? []).map((member) => member.user.display_name),
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(needle);
        });
    }, [chats, me.id, query]);

    const orderedChats = useMemo(
        () => [...filteredChats].sort((a, b) => activityTime(b) - activityTime(a)),
        [activityTime, filteredChats],
    );

    const openChat = (chat: Chat) => {
        const others = otherMembers(chat, me.id);

        store.markRead(chat.id);

        router.push({
            pathname: "/chat/[id]",
            params: {
                id: chat.id,
                title: chatTitle(chat, me.id),
                avatar: others.length === 1 ? others[0].user.avatar_url ?? "" : "",
                members: JSON.stringify(chat.members ?? []),
            },
        });
    };

    const renderItem = ({ item }: { item: Chat }) => {
        const title = chatTitle(item, me.id);
        const others = otherMembers(item, me.id);
        const lastMessage = store.getLastMessage(item.id);
        const preview = lastMessage
            ? lastMessagePreview(lastMessage, me.id)
            : chatPreview(item);
        const time = formatChatTime(lastMessage?.created_at ?? item.created_at);
        const avatarUri = others.length === 1 ? others[0].user.avatar_url : undefined;
        const unread = store.getUnread(item.id);

        return (
            <Pressable
                onPress={() => openChat(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${preview}`}
            >
                <Avatar name={title} uri={avatarUri || undefined} />
                <View style={styles.rowContent}>
                    <View style={styles.rowTop}>
                        <Text style={styles.name} numberOfLines={1}>
                            {title}
                        </Text>
                        {time ? <Text style={styles.time}>{time}</Text> : null}
                    </View>
                    <View style={styles.previewRow}>
                        <Text
                            style={[styles.preview, unread > 0 && styles.previewUnread]}
                            numberOfLines={2}
                        >
                            {preview}
                        </Text>
                        {unread > 0 ? (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadText}>
                                    {unread > 99 ? "99+" : unread}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Chats</Text>
            </View>

            <View style={styles.searchBar}>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search"
                    placeholderTextColor={theme.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={styles.searchInput}
                />
                {query ? (
                    <Pressable
                        onPress={() => setQuery("")}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                    >
                        <Text style={styles.clearButton}>×</Text>
                    </Pressable>
                ) : null}
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={theme.text} />
                </View>
            ) : error ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>Something went wrong</Text>
                    <Text style={styles.emptySubtitle}>{error}</Text>
                    <Pressable
                        onPress={() => void load()}
                        style={styles.retryButton}
                        accessibilityRole="button"
                    >
                        <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={orderedChats}
                    keyExtractor={(chat) => chat.id}
                    renderItem={renderItem}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    contentContainerStyle={styles.list}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => void load("refresh")}
                            tintColor={theme.text}
                            colors={[theme.text]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>
                                {query ? "No Results" : "No Conversations"}
                            </Text>
                            <Text style={styles.emptySubtitle}>
                                {query
                                    ? "Try searching for a different name."
                                    : "Your chats will show up here."}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        header: {
            paddingHorizontal: 16,
            paddingTop: 6,
        },
        headerTitle: {
            fontSize: 34,
            fontWeight: "700",
            letterSpacing: -0.6,
            color: theme.text,
        },
        searchBar: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 38,
            marginHorizontal: 16,
            marginTop: 10,
            marginBottom: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: theme.inputBackground,
        },
        searchInput: {
            flex: 1,
            paddingVertical: 8,
            fontSize: 16,
            color: theme.text,
        },
        clearButton: {
            fontSize: 20,
            lineHeight: 22,
            color: theme.placeholder,
        },
        list: {
            flexGrow: 1,
            paddingBottom: 20,
        },
        row: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
        },
        rowPressed: {
            backgroundColor: theme.pressedRow,
        },
        rowContent: {
            flex: 1,
            minWidth: 0,
        },
        rowTop: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
        },
        name: {
            flex: 1,
            fontSize: 17,
            fontWeight: "600",
            color: theme.text,
        },
        time: {
            marginTop: 2,
            fontSize: 13,
            color: theme.placeholder,
        },
        preview: {
            flex: 1,
            marginTop: 3,
            fontSize: 15,
            lineHeight: 20,
            color: theme.placeholder,
        },
        previewRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        previewUnread: {
            color: theme.text,
            fontWeight: "600",
        },
        unreadBadge: {
            minWidth: 20,
            height: 20,
            paddingHorizontal: 6,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.buttonColor,
        },
        unreadText: {
            fontSize: 12,
            fontWeight: "700",
            color: theme.sendIcon,
        },
        separator: {
            height: StyleSheet.hairlineWidth,
            marginLeft: 80,
            backgroundColor: theme.separator,
        },
        centered: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 32,
        },
        empty: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 6,
        },
        emptyTitle: {
            fontSize: 22,
            fontWeight: "600",
            color: theme.text,
            textAlign: "center",
        },
        emptySubtitle: {
            maxWidth: 280,
            fontSize: 15,
            lineHeight: 21,
            color: theme.placeholder,
            textAlign: "center",
        },
        retryButton: {
            marginTop: 8,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: theme.buttonColor,
        },
        retryText: {
            fontSize: 15,
            fontWeight: "600",
            color: theme.sendIcon,
        },
    });
