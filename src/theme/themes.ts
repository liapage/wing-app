export type Theme = {
    background: string;
    text: string;
    placeholder: string;
    /** Incoming (other people's) message bubbles. */
    otherBubble: string;
    /** Outgoing (your own) message bubbles — the user side is always blue. */
    sentBubble: string;
    /** Text and inline content drawn on top of `sentBubble`. */
    sentBubbleText: string;
    /** Translucent row highlight for pressed list items. */
    pressedRow: string;
    inputBackground: string;
    buttonColor: string;
    buttonDisabledColor: string;
    sendIcon: string;
    separator: string;
    link: string;
    codeBackground: string;
    quoteBorder: string;
    /** Errors, failed sends and `toolerror` blocks. */
    error: string;
};

export const lightTheme: Theme = {
    background: "#ffffff",
    text: "#202123",
    placeholder: "#8e8e93",
    otherBubble: "#f2f2f3",
    sentBubble: "#007AFF",
    sentBubbleText: "#ffffff",
    pressedRow: "#f0f0f0",
    inputBackground: "#f4f4f4",
    buttonColor: "#000000",
    buttonDisabledColor: "#c7c7cc",
    sendIcon: "#ffffff",
    separator: "#e5e5ea",
    link: "#0a66c2",
    codeBackground: "#e9e9ec",
    quoteBorder: "#d0d0d5",
    error: "#D06060",
};

export const darkTheme: Theme = {
    background: "#212121",
    text: "#ececec",
    placeholder: "#8e8e93",
    otherBubble: "#2a2a2a",
    sentBubble: "#0A84FF",
    sentBubbleText: "#ffffff",
    pressedRow: "#2a2a2a",
    inputBackground: "#303030",
    buttonColor: "#ffffff",
    buttonDisabledColor: "#4a4a4a",
    sendIcon: "#000000",
    separator: "#383838",
    link: "#7cc0ff",
    codeBackground: "#383838",
    quoteBorder: "#555555",
    error: "#D06060",
};
