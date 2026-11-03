import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const palette = [
    "#5B8DEF",
    "#8E7CF3",
    "#E58C3A",
    "#2F9E6E",
    "#D06060",
    "#2D9CDB",
    "#9B6BC4",
];

function initialsFor(name: string): string {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function colorFor(name: string): string {
    let hash = 0;

    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }

    return palette[Math.abs(hash) % palette.length];
}

type AvatarProps = {
    name: string;
    uri?: string;
    size?: number;
};

export default function Avatar({ name, uri, size = 52 }: AvatarProps) {
    const [failed, setFailed] = useState(false);
    const background = useMemo(() => colorFor(name || "?"), [name]);

    useEffect(() => {
        setFailed(false);
    }, [uri]);

    const circleStyle = {
        width: size,
        height: size,
        borderRadius: size / 2,
    };

    if (uri && !failed) {
        return (
            <Image
                source={{ uri }}
                style={[styles.circle, circleStyle, { backgroundColor: background }]}
                contentFit="cover"
                transition={150}
                onError={() => setFailed(true)}
                accessibilityIgnoresInvertColors
            />
        );
    }

    return (
        <View style={[styles.circle, circleStyle, { backgroundColor: background }]}>
            <Text style={[styles.initials, { fontSize: size * 0.34 }]}>
                {initialsFor(name)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    initials: {
        fontWeight: "600",
        color: "#ffffff",
        letterSpacing: 0.3,
    },
});
