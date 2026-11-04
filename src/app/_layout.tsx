import { Stack } from "expo-router";

import { AuthProvider } from "@/auth/AuthProvider";
import { MessagingProvider } from "@/messaging/MessagingProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";

export default function RootLayout() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <MessagingProvider>
                    <Stack screenOptions={{ headerShown: false }} />
                </MessagingProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
