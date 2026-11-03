import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { signInErrorMessage } from "@/auth/errors";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

// Web-only landing route for the Discord redirect. Native builds complete the
// browser session in place and never navigate here.
export default function AuthCallback() {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { status, completeSignIn } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (Platform.OS !== "web") {
            setDone(true);
            return;
        }

        let active = true;

        completeSignIn(window.location.href)
            .catch((err) => {
                if (active) setError(signInErrorMessage(err));
            })
            .finally(() => {
                if (active) setDone(true);
            });

        return () => {
            active = false;
        };
    }, [completeSignIn]);

    if (!done) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.text} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <Text style={[styles.error, { color: theme.text }]}>{error}</Text>
                <Pressable
                    onPress={() => router.replace("/login")}
                    style={[styles.button, { backgroundColor: theme.buttonColor }]}
                >
                    <Text style={[styles.buttonText, { color: theme.sendIcon }]}>
                        Back to sign in
                    </Text>
                </Pressable>
            </View>
        );
    }

    return <Redirect href={status === "authenticated" ? "/" : "/login"} />;
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            backgroundColor: theme.background,
        },
        error: {
            maxWidth: 280,
            fontSize: 14,
            textAlign: "center",
        },
        button: {
            minWidth: 240,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
            borderRadius: 24,
        },
        buttonText: {
            fontSize: 16,
            fontWeight: "600",
        },
    });
