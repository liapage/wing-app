import { Redirect, router, useLocalSearchParams } from "expo-router";

import ChatRoom from "@/components/ChatRoom";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/auth/AuthProvider";
import type { ChatMember } from "@/lib/wingd";

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function parseMembers(value: string | undefined): ChatMember[] {
    if (!value) return [];

    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((member): member is ChatMember => {
            const user = (member as ChatMember | null)?.user;
            return Boolean(
                user &&
                    typeof user.id === "string" &&
                    typeof user.display_name === "string",
            );
        });
    } catch {
        return [];
    }
}

export default function ChatScreen() {
    const auth = useAuth();
    const params = useLocalSearchParams<{
        id?: string | string[];
        title?: string | string[];
        avatar?: string | string[];
        members?: string | string[];
    }>();

    if (auth.status === "loading") {
        return <LoadingScreen />;
    }

    if (auth.status === "anonymous") {
        return <Redirect href="/login" />;
    }

    const id = firstParam(params.id) ?? "chat";
    const title = firstParam(params.title)?.trim() || "Chat";
    const avatarUrl = firstParam(params.avatar) || undefined;
    const members = parseMembers(firstParam(params.members));

    const goBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace("/");
    };

    return (
        <ChatRoom
            key={id}
            chatId={id}
            title={title}
            avatarUrl={avatarUrl}
            members={members}
            meId={auth.me.id}
            onBack={goBack}
        />
    );
}
