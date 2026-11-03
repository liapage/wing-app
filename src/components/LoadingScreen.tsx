import {useTheme} from "@/theme/ThemeProvider";
import {ActivityIndicator, StyleSheet, View} from "react-native";

export default function LoadingScreen() {
    const { theme } = useTheme();

    return (
        <View style={[styles.loading, { backgroundColor: theme.background }]}>
            <ActivityIndicator color={theme.text} />
        </View>
    );
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
});