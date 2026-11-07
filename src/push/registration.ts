import { PermissionsAndroid, Platform } from "react-native";

import { clearInstallationId, registerInstallationId, WingdApiError } from "@/lib/wingd";

type MessagingApi = typeof import("@react-native-firebase/messaging");

const isNative = Platform.OS === "ios" || Platform.OS === "android";

let cachedApi: MessagingApi | null | undefined;

// React Native Firebase ships no web build, so the module is required lazily on
// native only. A static import would be evaluated by the web bundle too.
function messagingApi(): MessagingApi | null {
    if (!isNative) return null;
    if (cachedApi !== undefined) return cachedApi;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cachedApi = require("@react-native-firebase/messaging") as MessagingApi;
    } catch (error) {
        // Expo Go and builds without the native module land here.
        console.warn("[push] React Native Firebase messaging is unavailable", error);
        cachedApi = null;
    }

    return cachedApi;
}

function isAuthorized(api: MessagingApi, status: number): boolean {
    return (
        status === api.AuthorizationStatus.AUTHORIZED ||
        status === api.AuthorizationStatus.PROVISIONAL
    );
}

async function ensurePermission(
    api: MessagingApi,
    messaging: ReturnType<MessagingApi["getMessaging"]>,
): Promise<boolean> {
    if (Platform.OS === "ios") {
        // RNFirebase documents this as deprecated in favour of a dedicated
        // permissions library, but it still prompts and is the only request path
        // that does not pull in expo-notifications.
        const status = await api.requestPermission(messaging);
        return isAuthorized(api, status);
    }

    if (Number(Platform.Version) >= 33) {
        // Android 13+: requestPermission is a no-op in RNFirebase, so the
        // POST_NOTIFICATIONS runtime permission has to be requested here.
        const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
}

function reportUploadFailure(error: unknown): void {
    if (error instanceof WingdApiError && (error.status === 404 || error.status === 405)) {
        // wingd derives FIDs from the sessions table but may not expose the
        // upsert route yet; keep the local registration working regardless.
        console.warn("[push] wingd has no /sessions/current/fid endpoint yet", error.status);
        return;
    }

    console.warn("[push] failed to upload installation ID", error);
}

type StartPushRegistrationOptions = {
    /** FID wingd already has on this session; matching values skip the upload. */
    knownFid?: string | null;
    uploadFid?: (fid: string) => Promise<void>;
};

/**
 * Starts Installation ID (FID) registration and keeps the current FID uploaded.
 *
 * `onRegistered` fires after every explicit `register()`, on FID rotation, and
 * when push subscriptions change, so one listener covers all of those cases.
 * Returns an unsubscribe function; it does not unregister the installation.
 */
export function startPushRegistration({
    knownFid = null,
    uploadFid = registerInstallationId,
}: StartPushRegistrationOptions = {}): () => void {
    const api = messagingApi();
    if (!api) return () => {};

    const messaging = api.getMessaging();

    const unsubscribe = api.onRegistered(messaging, (fid) => {
        if (__DEV__) console.log("[push] installation id:", fid);

        // /api/me reported this FID as already stored on the session.
        if (fid === knownFid) return;

        uploadFid(fid).catch(reportUploadFailure);
    });

    void (async () => {
        const granted = await ensurePermission(api, messaging);
        if (!granted) {
            console.warn("[push] notifications not permitted; registering anyway");
        }

        if (Platform.OS === "ios" && !api.isDeviceRegisteredForRemoteMessages(messaging)) {
            // `register()` does not touch APNs, so make sure the device token is
            // requested when iOS auto-registration has been turned off.
            await api.registerDeviceForRemoteMessages(messaging);
        }

        await api.register(messaging);
        if (__DEV__) console.log("[push] registered with FCM");
    })().catch((error) => {
        console.warn("[push] installation ID registration failed", error);
    });

    return unsubscribe;
}

/**
 * Unregisters the installation and clears its FID from the current session.
 * Call before ending the session, while the access token is still valid.
 */
export async function stopPushRegistration(): Promise<void> {
    const api = messagingApi();

    if (api) {
        try {
            await api.unregister(api.getMessaging());
        } catch (error) {
            console.warn("[push] failed to unregister installation", error);
        }
    }

    try {
        await clearInstallationId();
    } catch (error) {
        reportUploadFailure(error);
    }
}
