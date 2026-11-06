import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";

import { useAuth } from "@/auth/AuthProvider";
import LoadingScreen from "@/components/LoadingScreen";

export default function TabsLayout() {
    const auth = useAuth();

    if (auth.status === "loading") {
        return <LoadingScreen />;
    }

    if (auth.status === "anonymous") {
        return <Redirect href="/login" />;
    }

    return (
        <NativeTabs>
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Icon
                    sf={{
                        default: "bubble.left.and.bubble.right",
                        selected: "bubble.left.and.bubble.right.fill",
                    }}
                    md={{
                        default: "chat_bubble_outline",
                        selected: "chat_bubble",
                    }}
                />
                <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="projects">
                <NativeTabs.Trigger.Icon
                    sf={{
                        default: "folder",
                        selected: "folder.fill",
                    }}
                    md={{
                        default: "folder",
                        selected: "folder_open",
                    }}
                />
                <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
