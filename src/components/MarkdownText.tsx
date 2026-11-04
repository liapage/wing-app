import { useMemo } from "react";
import type { ReactNode } from "react";
import {
    Linking,
    Platform,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type TextStyle,
} from "react-native";

import { parseMarkdown, type InlineNode, type MarkdownBlock } from "@/markdown/parse";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

type MarkdownTextProps = {
    text: string;
    style?: StyleProp<TextStyle>;
};

const MONOSPACE_FONT = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
});

function openLink(href: string) {
    void Linking.openURL(href).catch(() => {
        // Ignore links the platform can't open.
    });
}

type MarkdownStyles = ReturnType<typeof createStyles>;

function renderInline(
    nodes: InlineNode[],
    styles: MarkdownStyles,
    keyPrefix = "inline",
): ReactNode[] {
    return nodes.map((node, index) => {
        const key = `${keyPrefix}-${index}`;

        switch (node.type) {
            case "text":
                return node.value;
            case "code":
                return (
                    <Text key={key} style={styles.inlineCode}>
                        {node.value}
                    </Text>
                );
            case "strong":
                return (
                    <Text key={key} style={styles.strong}>
                        {renderInline(node.children, styles, key)}
                    </Text>
                );
            case "em":
                return (
                    <Text key={key} style={styles.em}>
                        {renderInline(node.children, styles, key)}
                    </Text>
                );
            case "strike":
                return (
                    <Text key={key} style={styles.strike}>
                        {renderInline(node.children, styles, key)}
                    </Text>
                );
            case "link":
                return (
                    <Text
                        key={key}
                        style={styles.link}
                        accessibilityRole="link"
                        onPress={() => openLink(node.href)}
                    >
                        {renderInline(node.children, styles, key)}
                    </Text>
                );
        }
    });
}

function renderBlocks(
    blocks: MarkdownBlock[],
    styles: MarkdownStyles,
    textStyle: StyleProp<TextStyle> | undefined,
    keyPrefix = "block",
): ReactNode[] {
    return blocks.map((block, index) => {
        const key = `${keyPrefix}-${index}`;

        switch (block.type) {
            case "paragraph":
                return (
                    <Text key={key} style={[styles.text, textStyle]}>
                        {renderInline(block.content, styles, key)}
                    </Text>
                );
            case "heading": {
                const headingStyle =
                    block.level === 1
                        ? styles.heading1
                        : block.level === 2
                          ? styles.heading2
                          : styles.heading3;

                return (
                    <Text key={key} style={[styles.text, textStyle, headingStyle]}>
                        {renderInline(block.content, styles, key)}
                    </Text>
                );
            }
            case "code":
                return (
                    <View key={key} style={styles.codeBlock}>
                        <Text style={styles.codeText}>{block.value}</Text>
                    </View>
                );
            case "quote":
                return (
                    <View key={key} style={styles.quote}>
                        {renderBlocks(block.blocks, styles, textStyle, key)}
                    </View>
                );
            case "list":
                return (
                    <View key={key} style={styles.list}>
                        {block.items.map((item, itemIndex) => (
                            <View key={`${key}-${itemIndex}`} style={styles.listRow}>
                                <Text style={[styles.text, textStyle, styles.listMarker]}>
                                    {block.ordered
                                        ? `${block.start + itemIndex}.`
                                        : "•"}
                                </Text>
                                <Text
                                    style={[styles.text, textStyle, styles.listContent]}
                                >
                                    {renderInline(item, styles, `${key}-${itemIndex}`)}
                                </Text>
                            </View>
                        ))}
                    </View>
                );
            case "rule":
                return <View key={key} style={styles.rule} />;
        }
    });
}

export default function MarkdownText({ text, style }: MarkdownTextProps) {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const blocks = useMemo(() => parseMarkdown(text), [text]);

    if (blocks.length === 0) return null;

    if (blocks.length === 1 && blocks[0].type === "paragraph") {
        return (
            <Text style={[styles.text, style]}>
                {renderInline(blocks[0].content, styles)}
            </Text>
        );
    }

    return (
        <View style={styles.container}>
            {renderBlocks(blocks, styles, style)}
        </View>
    );
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexShrink: 1,
            gap: 4,
        },
        text: {
            fontSize: 16,
            lineHeight: 22,
            color: theme.text,
        },
        strong: {
            fontWeight: "700",
        },
        em: {
            fontStyle: "italic",
        },
        strike: {
            textDecorationLine: "line-through",
        },
        inlineCode: {
            fontFamily: MONOSPACE_FONT,
            fontSize: 14,
            color: theme.text,
            backgroundColor: theme.codeBackground,
            borderRadius: 4,
        },
        link: {
            color: theme.link,
            textDecorationLine: "underline",
        },
        heading1: {
            fontSize: 21,
            lineHeight: 27,
            fontWeight: "700",
        },
        heading2: {
            fontSize: 19,
            lineHeight: 25,
            fontWeight: "700",
        },
        heading3: {
            fontSize: 17,
            lineHeight: 23,
            fontWeight: "700",
        },
        codeBlock: {
            alignSelf: "stretch",
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: theme.codeBackground,
        },
        codeText: {
            fontFamily: MONOSPACE_FONT,
            fontSize: 13,
            lineHeight: 19,
            color: theme.text,
        },
        quote: {
            paddingLeft: 10,
            borderLeftWidth: 3,
            borderLeftColor: theme.quoteBorder,
            gap: 4,
        },
        list: {
            gap: 2,
        },
        listRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 6,
        },
        listMarker: {
            minWidth: 16,
            textAlign: "right",
            color: theme.placeholder,
        },
        listContent: {
            flex: 1,
            flexShrink: 1,
        },
        rule: {
            height: StyleSheet.hairlineWidth,
            marginVertical: 4,
            backgroundColor: theme.separator,
        },
    });
