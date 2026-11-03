import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

const fallbackUrl = Platform.OS === "web" ? "" : "http://localhost:8080";

export const wingdUrl = (process.env.EXPO_PUBLIC_WINGD_URL ?? fallbackUrl).replace(/\/$/, "");
const apiUrl = `${wingdUrl}/api`;

const tokenKey = "wingd_access_token";
const pendingLoginKey = "wingd_discord_login";

const discordAuthorizeUrl = "https://discord.com/oauth2/authorize";
const discordTokenUrl = "https://discord.com/api/v10/oauth2/token";

function getDiscordClientId(): string {
    const clientId = (process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID ?? "")
        .trim()
        .replace(/^["']|["']$/g, "");

    if (!clientId) throw new DiscordAuthError("missing_client_id");
    if (!/^\d{17,20}$/.test(clientId)) throw new DiscordAuthError("invalid_client_id");

    return clientId;
}

export type Me = {
    id: string;
    display_name: string;
    avatar_url: string;
};

type MeResponse = {
    user: Me;
};

type SessionResponse = {
    access_token: string;
    token_type: string;
    expires_at: string;
    user: Me;
};

type PendingLogin = {
    verifier: string;
    state: string;
    redirectUri: string;
};

export class DiscordAuthError extends Error {
    code: string;

    constructor(code: string) {
        super(code);
        this.name = "DiscordAuthError";
        this.code = code;
    }
}

async function readToken(): Promise<string | null> {
    if (Platform.OS === "web") {
        return globalThis.localStorage?.getItem(tokenKey) ?? null;
    }

    return SecureStore.getItemAsync(tokenKey);
}

async function saveToken(token: string): Promise<void> {
    if (Platform.OS === "web") {
        globalThis.localStorage?.setItem(tokenKey, token);
        return;
    }

    await SecureStore.setItemAsync(tokenKey, token);
}

export async function clearToken(): Promise<void> {
    if (Platform.OS === "web") {
        globalThis.localStorage?.removeItem(tokenKey);
        return;
    }

    await SecureStore.deleteItemAsync(tokenKey);
}

export async function fetchMe(): Promise<Me | null> {
    const token = await readToken();
    if (!token) return null;

    const response = await fetch(`${apiUrl}/me`, {
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 401) {
        await clearToken();
        return null;
    }
    if (!response.ok) throw new Error(`GET /api/me: ${response.status}`);

    const body = (await response.json()) as MeResponse;
    return body.user;
}

function getRedirectUri(): string {
    if (Platform.OS === "web") {
        return `${window.location.origin}/auth/callback`;
    }

    return "wing://auth/callback";
}

function encodeQuery(params: Record<string, string>): string {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}

async function randomHex(byteCount: number): Promise<string> {
    const bytes = await Crypto.getRandomBytesAsync(byteCount);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function codeChallenge(verifier: string): Promise<string> {
    const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier,
        { encoding: Crypto.CryptoEncoding.BASE64 },
    );

    return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function readPendingLogin(): PendingLogin | null {
    try {
        const raw = window.sessionStorage?.getItem(pendingLoginKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<PendingLogin>;
        if (!parsed.verifier || !parsed.state || !parsed.redirectUri) return null;

        return {
            verifier: parsed.verifier,
            state: parsed.state,
            redirectUri: parsed.redirectUri,
        };
    } catch {
        return null;
    }
}

function clearPendingLogin(): void {
    try {
        window.sessionStorage?.removeItem(pendingLoginKey);
    } catch {
        // Session storage is best-effort.
    }
}

async function exchangeDiscordCode(code: string, pending: PendingLogin): Promise<string> {
    const response = await fetch(discordTokenUrl, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: encodeQuery({
            client_id: getDiscordClientId(),
            grant_type: "authorization_code",
            code,
            redirect_uri: pending.redirectUri,
            code_verifier: pending.verifier,
        }),
    });

    const body = (await response.json().catch(() => ({}))) as {
        access_token?: string;
        error?: string;
    };

    if (!response.ok || !body.access_token) {
        throw new DiscordAuthError(body.error ?? `discord_token_${response.status}`);
    }

    return body.access_token;
}

async function createSession(discordAccessToken: string): Promise<Me> {
    const response = await fetch(`${apiUrl}/auth/discord`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: discordAccessToken }),
    });

    const body = (await response.json().catch(() => ({}))) as Partial<SessionResponse> & {
        error?: string;
    };

    if (!response.ok || !body.access_token || !body.user) {
        throw new DiscordAuthError(body.error ?? `wingd_auth_${response.status}`);
    }

    await saveToken(body.access_token);
    return body.user;
}

// Step 1: open Discord with a PKCE challenge. On native the browser session
// returns the redirect URL directly; on web the page navigates to the callback
// route, which calls completeDiscordSignIn.
export async function signInWithDiscord(): Promise<Me> {
    const clientId = getDiscordClientId();

    const pending: PendingLogin = {
        redirectUri: getRedirectUri(),
        verifier: await randomHex(32),
        state: await randomHex(16),
    };
    const challenge = await codeChallenge(pending.verifier);

    const authorizeUrl = `${discordAuthorizeUrl}?${
        encodeQuery({
            client_id: clientId,
            response_type: "code",
            scope: "identify",
            redirect_uri: pending.redirectUri,
            code_challenge: challenge,
            code_challenge_method: "S256",
            state: pending.state,
        })
    }`;

    if (Platform.OS === "web") {
        window.sessionStorage?.setItem(pendingLoginKey, JSON.stringify(pending));
        window.location.assign(authorizeUrl);
        return new Promise<Me>(() => {});
    }

    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, pending.redirectUri);
    if (result.type !== "success") throw new DiscordAuthError("cancelled");

    return completeDiscordSignIn(result.url, pending);
}

// Step 2: verify the redirect, exchange the code with Discord, then trade the
// Discord access token for a wingd session.
export async function completeDiscordSignIn(
    callbackUrl: string,
    pendingOverride?: PendingLogin,
): Promise<Me> {
    const pending = pendingOverride ?? readPendingLogin();
    if (!pending) throw new DiscordAuthError("missing_pending_login");
    clearPendingLogin();

    const params = Linking.parse(callbackUrl).queryParams ?? {};
    const error = firstValue(params.error);
    if (error) throw new DiscordAuthError(error);

    const code = firstValue(params.code);
    const state = firstValue(params.state);
    if (!code) throw new DiscordAuthError("invalid_callback");
    if (state !== pending.state) throw new DiscordAuthError("state_mismatch");

    const discordAccessToken = await exchangeDiscordCode(code, pending);
    return createSession(discordAccessToken);
}
