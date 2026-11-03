export type Theme = {
    background: string;
    text: string;
    placeholder: string;
    userBubble: string;
    inputBackground: string;
    buttonColor: string;
    buttonDisabledColor: string;
    sendIcon: string;
};

export const lightTheme: Theme = {
    background: "#ffffff",
    text: "#202123",
    placeholder: "#8e8e93",
    userBubble: "#f0f0f0",
    inputBackground: "#f4f4f4",
    buttonColor: "#000000",
    buttonDisabledColor: "#c7c7cc",
    sendIcon: "#ffffff",
};

export const darkTheme: Theme = {
    background: "#212121",
    text: "#ececec",
    placeholder: "#8e8e93",
    userBubble: "#303030",
    inputBackground: "#303030",
    buttonColor: "#ffffff",
    buttonDisabledColor: "#4a4a4a",
    sendIcon: "#000000",
};