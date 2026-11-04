import { useMemo, useRef, useState } from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import {useTheme} from "@/theme/ThemeProvider";
import {Theme} from "@/theme/themes";

export type ChatInputProps = {
    input: string;
    setInput: (val: string) => void;
    onSubmit: () => void;
};

export default function ChatInput({input, setInput, onSubmit}: ChatInputProps) {
    const {theme} = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const canSend = input.trim().length > 0;

    return (
        <View style={styles.inputBar}>
            <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Message"
                placeholderTextColor={theme.placeholder}
                autoCorrect={false}
                autoCapitalize="none"
                multiline
                maxLength={4000}
                style={styles.textInput}
            />
            <Pressable
                onPress={onSubmit}
                disabled={!canSend}
                style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            >
                <Text style={styles.sendIcon}>↑</Text>
            </Pressable>
        </View>
    );
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        inputBar: {
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            marginHorizontal: 12,
            marginBottom: 8,
            paddingLeft: 16,
            paddingRight: 8,
            paddingVertical: 8,
            borderRadius: 24,
            backgroundColor: theme.inputBackground,
        },
        textInput: {
            flex: 1,
            maxHeight: 120,
            paddingTop: Platform.OS === "ios" ? 8 : 4,
            paddingBottom: Platform.OS === "ios" ? 8 : 4,
            fontSize: 16,
            color: theme.text,
        },
        sendButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.buttonColor,
        },
        sendIcon: {
            color: theme.sendIcon,
            fontSize: 20,
            fontWeight: "700",
            marginTop: -2,
        },
        sendButtonDisabled: {
            backgroundColor: theme.buttonDisabledColor,
        },
    });