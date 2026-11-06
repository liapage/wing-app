import ChatsScreen from "@/components/ChatsScreen";
import { useAuth } from "@/auth/AuthProvider";

export default function ChatsTab() {
    const auth = useAuth();

    if (auth.status !== "authenticated") return null;

    return <ChatsScreen me={auth.me} />;
}
