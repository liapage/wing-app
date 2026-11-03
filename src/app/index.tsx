import { Redirect } from "expo-router";

import ChannelRoom from "@/components/ChannelRoom";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import LoadingScreen from "@/components/LoadingScreen";

export default function Index() {
    const { status } = useAuth();

    if (status === "loading") {
        return (
            <LoadingScreen />
        );
    }

    if (status === "anonymous") {
        return <Redirect href="/login" />;
    }

    return <ChannelRoom />;
}