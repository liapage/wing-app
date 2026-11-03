import { useMemo, useRef, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Avatar from "@/components/Avatar";
import { useTheme } from "@/theme/ThemeProvider";
import { Theme } from "@/theme/themes";
import ChatInput from "@/components/ChatInput";

type Message = {
    id: string;
    role: "user" | "assistant";
    text: string;
};

type ChatRoomProps = {
    title: string;
    avatarUrl?: string;
    onBack?: () => void;
};

export default function ChatRoom({ title, avatarUrl, onBack }: ChatRoomProps) {
    const {theme} = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const listRef = useRef<FlatList<Message>>(null);

    const send = () => {
        const text = input.trim();
        if (!text) return;

        const userMessage: Message = {
            id: `${Date.now()}-user`,
            role: "user",
            text,
        };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");

        // Placeholder reply. Replace this with a real API call.
        setTimeout(() => {
            setMessages((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-assistant`,
                    role: "assistant",
                    text: `You said: ${text}`,
                },
            ]);
        }, 600);
    };

    const renderItem = ({ item }: { item: Message }) => {
        const isUser = item.role === "user";
        return (
            <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
                <View
                    style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
                >
                    <Text style={styles.messageText}>{item.text}</Text>
                </View>
            </View>
        );
    };

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
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(m) => m.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>Start the conversation</Text>
                        </View>
                    }
                />

                <ChatInput input={input} setInput={setInput} onSubmit={send} />
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
            padding: 16,
            gap: 12,
        },
        empty: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
        },
        emptyText: {
            fontSize: 22,
            fontWeight: "600",
            color: theme.text,
        },
        row: {
            flexDirection: "row",
        },
        rowUser: {
            justifyContent: "flex-end",
        },
        rowAssistant: {
            justifyContent: "flex-start",
        },
        bubble: {
            maxWidth: "85%",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 18,
        },
        bubbleUser: {
            backgroundColor: theme.userBubble,
        },
        bubbleAssistant: {
            backgroundColor: "transparent",
            paddingHorizontal: 0,
        },
        messageText: {
            fontSize: 16,
            lineHeight: 22,
            color: theme.text,
        },
    });