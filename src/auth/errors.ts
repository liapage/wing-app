import { DiscordAuthError } from "@/lib/wingd";

export function signInErrorMessage(error: unknown): string {
    if (error instanceof DiscordAuthError) {
        switch (error.code) {
            case "cancelled":
                return "Discord sign-in was cancelled.";
            case "access_denied":
                return "Discord authorization was denied.";
            case "missing_client_id":
                return "Discord is not configured for this build.";
            case "invalid_client_id":
                return "EXPO_PUBLIC_DISCORD_CLIENT_ID must be the numeric Discord application ID.";
            case "missing_pending_login":
                return "This sign-in expired. Try again.";
            case "state_mismatch":
                return "Sign-in could not be verified. Try again.";
            case "invalid_grant":
                return "The Discord code expired. Try again.";
            case "invalid_token":
                return "Discord did not accept the sign-in. Try again.";
            case "discord_unavailable":
                return "Discord is unavailable right now. Try again.";
            default:
                return `Discord sign-in failed (${error.code}).`;
        }
    }

    return "Something went wrong. Try again.";
}
