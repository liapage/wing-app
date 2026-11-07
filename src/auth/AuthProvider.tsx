import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { clearToken, completeDiscordSignIn, fetchMe, signInWithDiscord, type Me } from "@/lib/wingd";
import { stopPushRegistration } from "@/push/registration";

type Session =
    | { status: "loading" }
    | { status: "anonymous" }
    // `fid` is the installation ID wingd currently has on this session, if any.
    | { status: "authenticated"; me: Me; fid: string | null };

type Auth = Session & {
    signIn: () => Promise<void>;
    completeSignIn: (callbackUrl: string) => Promise<void>;
    refresh: () => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session>({ status: "loading" });

    const refresh = useCallback(async () => {
        try {
            const current = await fetchMe();
            setSession(
                current
                    ? {
                          status: "authenticated",
                          me: current.user,
                          fid: current.session?.fid ?? null,
                      }
                    : { status: "anonymous" },
            );
        } catch {
            setSession({ status: "anonymous" });
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const signIn = useCallback(async () => {
        const me = await signInWithDiscord();
        // A freshly created session starts without an FID.
        setSession({ status: "authenticated", me, fid: null });
    }, []);

    const completeSignIn = useCallback(async (callbackUrl: string) => {
        const me = await completeDiscordSignIn(callbackUrl);
        setSession({ status: "authenticated", me, fid: null });
    }, []);

    const signOut = useCallback(async () => {
        // Unregister while the access token is still valid so wingd can drop the
        // FID from this session before it ends.
        try {
            await stopPushRegistration();
        } catch {
            // Clearing the local session must not depend on push teardown.
        }
        await clearToken();
        setSession({ status: "anonymous" });
    }, []);

    const value = useMemo(
        () => ({ ...session, signIn, completeSignIn, refresh, signOut }),
        [session, signIn, completeSignIn, refresh, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error("useAuth must be used inside AuthProvider");
    return auth;
}
