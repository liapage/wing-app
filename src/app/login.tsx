import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signInErrorMessage } from "@/auth/errors";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

export default function Login() {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { status, signIn } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (status === "authenticated") {
        return <Redirect href="/" />;
    }

    const onSignIn = async () => {
        setBusy(true);
        setError(null);

        try {
            await signIn();
        } catch (err) {
            setError(signInErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <View style={styles.content}>
                <Text style={styles.title}>Wing</Text>
                <Text style={styles.subtitle}>Build your personal sidekick</Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                    onPress={onSignIn}
                    disabled={busy || status === "loading"}
                    style={styles.button}
                >
                    {busy
                        ? <ActivityIndicator color={theme.sendIcon} />
                        : (
                            <Text style={styles.buttonText}>
                                {error ? "Try again" : "Continue with Discord"}
                            </Text>
                        )}
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        content: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 12,
        },
        title: {
            fontSize: 40,
            fontWeight: "700",
            color: theme.text,
        },
        subtitle: {
            marginBottom: 16,
            fontSize: 16,
            color: theme.placeholder,
        },
        error: {
            maxWidth: 280,
            fontSize: 14,
            color: theme.text,
            textAlign: "center",
        },
        button: {
            minWidth: 240,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
            borderRadius: 24,
            backgroundColor: theme.buttonColor,
        },
        buttonText: {
            fontSize: 16,
            fontWeight: "600",
            color: theme.sendIcon,
        },
    });
