import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { startPushRegistration } from "@/push/registration";

/**
 * Registers for push once the session is authenticated. Sign-out is handled by
 * `AuthProvider.signOut`, which unregisters before clearing the token.
 */
export function usePushRegistration(): void {
    const auth = useAuth();
    const status = auth.status;
    const knownFid = auth.status === "authenticated" ? auth.fid : null;

    useEffect(() => {
        if (status !== "authenticated") return;

        return startPushRegistration({ knownFid });
    }, [status, knownFid]);
}
