import { Redirect } from "expo-router";

import ChatsScreen from "@/components/ChatsScreen";
import { useAuth } from "@/auth/AuthProvider";
import LoadingScreen from "@/components/LoadingScreen";

export default function Index() {
    const auth = useAuth();

    if (auth.status === "loading") {
        return (
            <LoadingScreen />
        );
    }

    if (auth.status === "anonymous") {
        return <Redirect href="/login" />;
    }

    return <ChatsScreen me={auth.me} />;
}
