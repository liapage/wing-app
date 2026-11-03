import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { completeDiscordSignIn, fetchMe, signInWithDiscord, type Me } from "@/lib/wingd";

type Session =
    | { status: "loading" }
    | { status: "anonymous" }
    | { status: "authenticated"; me: Me };

type Auth = Session & {
    signIn: () => Promise<void>;
    completeSignIn: (callbackUrl: string) => Promise<void>;
    refresh: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session>({ status: "loading" });

    const refresh = useCallback(async () => {
        try {
            const me = await fetchMe();
            setSession(me ? { status: "authenticated", me } : { status: "anonymous" });
        } catch {
            setSession({ status: "anonymous" });
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const signIn = useCallback(async () => {
        const me = await signInWithDiscord();
        setSession({ status: "authenticated", me });
    }, []);

    const completeSignIn = useCallback(async (callbackUrl: string) => {
        const me = await completeDiscordSignIn(callbackUrl);
        setSession({ status: "authenticated", me });
    }, []);

    const value = useMemo(
        () => ({ ...session, signIn, completeSignIn, refresh }),
        [session, signIn, completeSignIn, refresh],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error("useAuth must be used inside AuthProvider");
    return auth;
}
