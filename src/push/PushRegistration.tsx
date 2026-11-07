import { usePushRegistration } from "@/push/usePushRegistration";

/** Headless mount point for push registration; renders nothing. */
export function PushRegistration() {
    usePushRegistration();
    return null;
}
