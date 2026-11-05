import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import Avatar from "@/components/Avatar";
import ChatInput from "@/components/ChatInput";
import MarkdownText from "@/components/MarkdownText";
import { useChatMessages, type ChatMessage } from "@/hooks/useChatMessages";
import type { ChatMember } from "@/lib/wingd";
import { useMessagingStore } from "@/messaging/MessagingProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Theme } from "@/theme/themes";

const GROUP_GAP_MS = 5 * 60 * 1000;

type ChatRoomProps = {
    chatId: string;
    title: string;
    avatarUrl?: string;
    members?: ChatMember[];
    meId: string;
    onBack?: () => void;
};

function formatMessageTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
}

// Whether the message next to `index` belongs to the same run of consecutive
// messages: same sender, close enough in time. Both ends of the list count as
// a neighbourless message. System messages have no sender, so each one
// stands alone.
function inSameGroup(
    messages: readonly ChatMessage[],
    index: number,
    step: 1 | -1,
): boolean {
    const message = messages[index];
    // Indices off either end of the array read back `undefined`.
    const neighbour = messages[index + step];
    if (!message || !neighbour) return false;
    if (!message.sender_id || !neighbour.sender_id) return false;
    if (message.sender_id !== neighbour.sender_id) return false;

    const time = new Date(message.created_at).getTime();
    const neighbourTime = new Date(neighbour.created_at).getTime();
    if (Number.isNaN(time) || Number.isNaN(neighbourTime)) return false;

    return Math.abs(neighbourTime - time) <= GROUP_GAP_MS;
}

const BUBBLE_RADIUS = 18;
const SQUARED_RADIUS = 4;

function bubbleRadii(
    side: "left" | "right",
    inGroupWithOlder: boolean,
    inGroupWithNewer: boolean,
) {
    console.log(side, inGroupWithOlder, inGroupWithNewer);
    const corner = (touchesNeighbour: boolean) =>
        touchesNeighbour ? SQUARED_RADIUS : BUBBLE_RADIUS;

    return side === "right"
        ? {
              borderTopRightRadius: corner(inGroupWithOlder),
              borderBottomRightRadius: corner(inGroupWithNewer),
          }
        : {
            borderTopLeftRadius: corner(inGroupWithOlder),
            borderBottomLeftRadius: corner(inGroupWithNewer),
          };
}

export default function ChatRoom({
    chatId,
    title,
    avatarUrl,
    members = [],
    meId,
    onBack,
}: ChatRoomProps) {
    const { theme } = useTheme();
    const { refresh } = useAuth();
    const store = useMessagingStore();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [input, setInput] = useState("");
    const listRef = useRef<FlatList<ChatMessage>>(null);
    const atBottomRef = useRef(true);

    // While this screen is mounted it owns read receipts for the chat; the
    // socket keeps appending to the same store it is reading from.
    useEffect(() => {
        store.setActiveChat(chatId);

        return () => {
            store.setActiveChat(null);
        };
    }, [chatId, store]);

    const handleUnauthorized = useCallback(() => {
        void refresh();
    }, [refresh]);

    const {
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
    } = useChatMessages(chatId, { meId, onUnauthorized: handleUnauthorized });

    const membersById = useMemo(
        () => new Map(members.map((member) => [member.user.id, member.user])),
        [members],
    );

    // Sender names only help when more than one other person is in the chat.
    const otherMemberCount = members.filter((member) => member.user.id !== meId).length;
    const hasMultipleSenders = otherMemberCount !== 1;

    // Newest first: the FlatList is inverted, so index 0 sits at the bottom.
    const listData = useMemo(() => [...messages].reverse(), [messages]);

    const handleSend = () => {
        const text = input.trim();
        if (!text) return;

        setInput("");
        void send(text);
    };

    const lastMessage = messages[messages.length - 1];
    const lastScrolledId = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!lastMessage || lastMessage.id === lastScrolledId.current) return;
        lastScrolledId.current = lastMessage.id;

        // Follow own sends and anything that arrives while the user is already
        // at the bottom; don't yank them away from older history they're reading.
        if (lastMessage.sender_id === meId || atBottomRef.current) {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
    }, [lastMessage, meId]);

    const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isMine = item.sender_id === meId;
        const member = item.sender_id ? membersById.get(item.sender_id) : undefined;
        const name = member?.display_name?.trim() || (item.sender_id ? "Unknown" : "System");
        // `listData` is newest first, so the older message sits at index + 1
        // and the newer one at index - 1.
        const inGroupWithOlder = inSameGroup(listData, index, 1);
        const inGroupWithNewer = inSameGroup(listData, index, -1);
        const isSystem = !item.sender_id;
        // Received messages always carry the avatar, even in one-to-one chats;
        // the sender's name is only useful when the chat has several people.
        const showSender = !isMine && !isSystem;
        const showSenderName = showSender && hasMultipleSenders;
        const status = item.status;

        return (
            <View
                style={[
                    styles.row,
                    isMine ? styles.rowMine : styles.rowOther,
                    !inGroupWithOlder && styles.rowGroupStart,
                    inGroupWithOlder && styles.rowSameSender,
                ]}
            >
                {showSender ? (
                    <View style={styles.avatarSlot}>
                        {!inGroupWithOlder ? (
                            <Avatar
                                name={name}
                                uri={member?.avatar_url || undefined}
                                size={28}
                            />
                        ) : null}
                    </View>
                ) : null}

                <View
                    style={[
                        styles.messageColumn,
                        isMine ? styles.columnMine : styles.columnOther,
                    ]}
                >
                    {!inGroupWithOlder ? (
                        <View style={styles.metaRow}>
                            {showSenderName ? (
                                <Text style={styles.senderName} numberOfLines={1}>
                                    {name}
                                </Text>
                            ) : null}
                            <Text style={styles.time}>
                                {formatMessageTime(item.created_at)}
                            </Text>
                        </View>
                    ) : null}

                    <Pressable
                        disabled={status !== "failed" || !item.localId}
                        onPress={() => {
                            if (item.localId) retry(item.localId);
                        }}
                        accessibilityRole={status === "failed" ? "button" : undefined}
                        accessibilityLabel={
                            status === "failed" ? "Message failed. Tap to retry." : undefined
                        }
                    >
                        <View
                            style={[
                                styles.bubble,
                                isMine ? styles.bubbleMine : styles.bubbleOther,
                                status === "failed" && styles.bubbleFailed,
                                bubbleRadii(
                                    isMine ? "right" : "left",
                                    inGroupWithOlder,
                                    inGroupWithNewer,
                                ),
                            ]}
                        >
                            <MarkdownText
                                text={item.text}
                                style={
                                    isMine
                                        ? [styles.messageText, styles.messageTextMine]
                                        : styles.messageText
                                }
                                onAccent={isMine}
                            />
                        </View>
                    </Pressable>

                    {status === "sending" ? (
                        <Text style={[styles.status, isMine && styles.statusMine]}>
                            Sending…
                        </Text>
                    ) : null}
                    {status === "failed" ? (
                        <Text
                            style={[
                                styles.status,
                                styles.statusFailed,
                                isMine && styles.statusMine,
                            ]}
                        >
                            Not sent · Tap to retry
                        </Text>
                    ) : null}
                </View>
            </View>
        );
    };

    const listFooter =
        hasMore && loadingOlder ? (
            <View style={styles.listFooter}>
                <ActivityIndicator color={theme.placeholder} />
            </View>
        ) : hasMore && olderError ? (
            <Pressable
                onPress={() => void loadOlder()}
                style={styles.listFooter}
                accessibilityRole="button"
                accessibilityLabel="Retry loading earlier messages"
            >
                <Text style={styles.footerText}>{olderError} Tap to retry.</Text>
            </Pressable>
        ) : null;

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <View style={styles.header}>
                <View style={styles.headerSide}>
                    {onBack ? (
                        <Pressable
                            onPress={onBack}
                            hitSlop={10}
                            style={styles.backButton}
                            accessibilityRole="button"
                            accessibilityLabel="Back to chats"
                        >
                            <Text style={styles.backIcon}>‹</Text>
                        </Pressable>
                    ) : null}
                </View>

                <View style={styles.headerCenter}>
                    <Avatar name={title} uri={avatarUrl || undefined} size={30} />
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {title}
                    </Text>
                </View>

                <View style={styles.headerSide} />
            </View>

            <KeyboardAvoidingView
                style={styles.flex}
                // Edge-to-edge is enabled on Android, so the window is not
                // resized for the IME anymore (`adjustResize` is ignored).
                // Both platforms need the view to avoid the keyboard itself.
                behavior="padding"
            >
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
                ) : messages.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>Start the conversation</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        data={listData}
                        inverted
                        keyExtractor={(message) => message.localId ?? message.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        onEndReached={() => void loadOlder()}
                        onEndReachedThreshold={0.4}
                        ListFooterComponent={listFooter ?? undefined}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        onScroll={(event) => {
                            atBottomRef.current =
                                event.nativeEvent.contentOffset.y < 80;
                        }}
                        scrollEventThrottle={16}
                    />
                )}

                <ChatInput input={input} setInput={setInput} onSubmit={handleSend} />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        flex: { flex: 1 },
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            minHeight: 50,
            paddingHorizontal: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.separator,
        },
        headerSide: {
            width: 48,
            alignItems: "flex-start",
        },
        backButton: {
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
        },
        backIcon: {
            marginTop: -3,
            fontSize: 38,
            lineHeight: 40,
            color: theme.text,
        },
        headerCenter: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minWidth: 0,
        },
        headerTitle: {
            flexShrink: 1,
            fontSize: 17,
            fontWeight: "600",
            color: theme.text,
        },
        list: {
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingVertical: 12,
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
        },
        emptyText: {
            fontSize: 22,
            fontWeight: "600",
            color: theme.text,
            textAlign: "center",
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
        listFooter: {
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
        },
        footerText: {
            fontSize: 13,
            color: theme.placeholder,
            textAlign: "center",
        },
        row: {
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: 2,
        },
        rowGroupStart: {
            marginTop: 14,
        },
        // Consecutive bubbles from one sender sit slightly closer together so
        // they read as one stack.
        rowSameSender: {
            marginTop: 4,
        },
        rowMine: {
            justifyContent: "flex-end",
        },
        rowOther: {
            justifyContent: "flex-start",
        },
        avatarSlot: {
            width: 28,
            // Nudges the avatar down so it lines up with the first line of text
            // instead of its top edge.
            marginTop: 3,
            marginRight: 8,
        },
        messageColumn: {
            maxWidth: "82%",
            flexShrink: 1,
        },
        columnMine: {
            alignItems: "flex-end",
            marginLeft: "auto",
        },
        columnOther: {
            alignItems: "flex-start",
        },
        metaRow: {
            flexDirection: "row",
            alignItems: "baseline",
            gap: 6,
            marginBottom: 3,
            paddingHorizontal: 2,
        },
        senderName: {
            flexShrink: 1,
            fontSize: 13,
            fontWeight: "600",
            color: theme.text,
        },
        time: {
            fontSize: 11,
            color: theme.placeholder,
        },
        bubble: {
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: BUBBLE_RADIUS,
        },
        bubbleMine: {
            backgroundColor: theme.sentBubble,
        },
        bubbleOther: {
            backgroundColor: theme.otherBubble,
        },
        bubbleFailed: {
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "#D06060",
        },
        messageText: {
            fontSize: 16,
            lineHeight: 22,
            color: theme.text,
        },
        messageTextMine: {
            color: theme.sentBubbleText,
        },
        status: {
            marginTop: 3,
            paddingHorizontal: 2,
            fontSize: 11,
            color: theme.placeholder,
        },
        statusMine: {
            textAlign: "right",
        },
        statusFailed: {
            color: "#D06060",
        },
    });
