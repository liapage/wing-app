import { useMemo, useRef, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {useTheme} from "@/theme/ThemeProvider";
import {Theme} from "@/theme/themes";
import ChatInput from "@/components/ChatInput";

type Message = {
    id: string;
    role: "user" | "assistant";
    text: string;
};

export default function ChannelRoom() {
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