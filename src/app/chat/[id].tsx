import { Redirect, router, useLocalSearchParams } from "expo-router";

import ChatRoom from "@/components/ChatRoom";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/auth/AuthProvider";

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default function ChatScreen() {
    const { status } = useAuth();
    const params = useLocalSearchParams<{
        id?: string | string[];
        title?: string | string[];
        avatar?: string | string[];
    }>();

    if (status === "loading") {
        return <LoadingScreen />;
    }

    if (status === "anonymous") {
        return <Redirect href="/login" />;
    }

    const id = firstParam(params.id) ?? "chat";
    const title = firstParam(params.title)?.trim() || "Chat";
    const avatarUrl = firstParam(params.avatar) || undefined;

    const goBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace("/");
    };

    return <ChatRoom key={id} title={title} avatarUrl={avatarUrl} onBack={goBack} />;
}
