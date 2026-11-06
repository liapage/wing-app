import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import MarkdownText from "@/components/MarkdownText";
import type { ChatMessage } from "@/messaging/store";
import { toolMessageInfo } from "@/messaging/toolMessages";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

type ToolMessageGroupProps = {
    messages: readonly ChatMessage[];
    onAccent?: boolean;
};

// Consecutive tool calls read as one unit. While collapsed only the newest
// `tooluse` / `toolerror` block is visible; pressing the group reveals them all.
export default function ToolMessageGroup({
    messages,
    onAccent = false,
}: ToolMessageGroupProps) {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme, onAccent), [theme, onAccent]);
    const [expanded, setExpanded] = useState(false);

    const latest = messages[messages.length - 1];
    const latestTool = latest ? toolMessageInfo(latest) : undefined;
    const isError = latestTool?.language === "toolerror";
    const collapsible = messages.length > 1;
    const visible: readonly ChatMessage[] =
        expanded || !collapsible ? messages : latest ? [latest] : [];

    return (
        <Pressable
            disabled={!collapsible}
            onPress={() => setExpanded((value) => !value)}
            accessibilityRole={collapsible ? "button" : undefined}
            accessibilityState={collapsible ? { expanded } : undefined}
            accessibilityHint={
                collapsible
                    ? `${expanded ? "Collapse" : "Expand"} ${messages.length} tool calls`
                    : undefined
            }
            style={styles.container}
        >
            <View style={styles.header}>
                <Text style={[styles.label, isError && styles.labelError]}>
                    {isError ? "Tool error" : "Tool use"}
                </Text>
                {collapsible ? (
                    <View style={styles.headerRight}>
                        <Text style={styles.count}>{messages.length} calls</Text>
                        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.blocks}>
                {visible.map((message) => {
                    const info = toolMessageInfo(message);
                    const messageIsError = info?.language === "toolerror";

                    return (
                        <View
                            key={message.localId ?? message.id}
                            style={styles.block}
                        >
                            {collapsible && expanded ? (
                                <Text
                                    style={[
                                        styles.blockLabel,
                                        messageIsError && styles.labelError,
                                    ]}
                                >
                                    {messageIsError ? "Tool error" : "Tool use"}
                                </Text>
                            ) : null}
                            <MarkdownText text={message.text} onAccent={onAccent} />
                        </View>
                    );
                })}
            </View>
        </Pressable>
    );
}

const createStyles = (theme: Theme, onAccent = false) => {
    const textColor = onAccent ? theme.sentBubbleText : theme.text;
    const mutedColor = onAccent ? "rgba(255,255,255,0.75)" : theme.placeholder;

    return StyleSheet.create({
        container: {
            gap: 6,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        headerRight: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginLeft: "auto",
        },
        label: {
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: textColor,
        },
        labelError: {
            color: theme.error,
        },
        count: {
            fontSize: 12,
            color: mutedColor,
        },
        chevron: {
            width: 12,
            fontSize: 12,
            lineHeight: 14,
            textAlign: "center",
            color: mutedColor,
        },
        blocks: {
            gap: 6,
        },
        block: {
            gap: 3,
        },
        blockLabel: {
            fontSize: 10,
            fontWeight: "600",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: mutedColor,
        },
    });
};
