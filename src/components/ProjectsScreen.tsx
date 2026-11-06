import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import {
    fetchProjectTasks,
    fetchProjects,
    WingdApiError,
    type Project,
    type Task,
} from "@/lib/wingd";
import { formatTaskDueDate, formatTaskRepeat } from "@/lib/taskSchedule";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

type ProjectWithTasks = Project & {
    tasks: Task[];
};

function taskCountLabel(count: number): string {
    if (count === 0) return "No tasks";
    return count === 1 ? "1 task" : `${count} tasks`;
}

export default function ProjectsScreen() {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { refresh: refreshSession } = useAuth();

    const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        };
    }, []);

    const load = useCallback(
        async (mode: "initial" | "refresh" = "initial") => {
            if (mode === "refresh") {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            try {
                const nextProjects = await fetchProjects();
                const withTasks = await Promise.all(
                    nextProjects.map(async (project) => ({
                        ...project,
                        tasks: await fetchProjectTasks(project.id),
                    })),
                );

                if (mounted.current) setProjects(withTasks);
            } catch (err) {
                if (!mounted.current) return;

                if (err instanceof WingdApiError && err.status === 401) {
                    await refreshSession();
                    return;
                }

                setError("Couldn't load your projects.");
            } finally {
                if (mounted.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [refreshSession],
    );

    useEffect(() => {
        void load();
    }, [load]);

    const renderTask = (task: Task) => {
        const due = formatTaskDueDate(task.due_at, task.timezone);
        const repeat = formatTaskRepeat(task.rrule, task.repeat_until, task.timezone);
        const scheduleLabel = [due?.text, repeat?.text].filter(Boolean).join(", ");

        return (
            <View
                key={task.id}
                style={styles.taskRow}
                accessibilityLabel={`${task.name}${task.completed ? ", completed" : ""}${
                    scheduleLabel ? `, ${scheduleLabel}` : ""
                }`}
            >
                <View
                    style={[styles.taskCheck, task.completed && styles.taskCheckCompleted]}
                >
                    {task.completed ? <Text style={styles.taskCheckMark}>✓</Text> : null}
                </View>
                <View style={styles.taskContent}>
                    <Text
                        style={[styles.taskName, task.completed && styles.taskNameCompleted]}
                    >
                        {task.name}
                    </Text>
                    {task.description ? (
                        <Text style={styles.taskDescription}>{task.description}</Text>
                    ) : null}
                    {due || repeat ? (
                        <View style={styles.taskMeta}>
                            {due ? (
                                <View
                                    style={[
                                        styles.metaChip,
                                        task.completed && styles.metaChipCompleted,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.metaText,
                                            !task.completed &&
                                                due.tone === "overdue" &&
                                                styles.metaTextOverdue,
                                            !task.completed &&
                                                due.tone === "today" &&
                                                styles.metaTextToday,
                                        ]}
                                    >
                                        {due.text}
                                    </Text>
                                </View>
                            ) : null}
                            {repeat ? (
                                <View
                                    style={[
                                        styles.metaChip,
                                        task.completed && styles.metaChipCompleted,
                                    ]}
                                >
                                    <Text style={styles.metaText}>{repeat.text}</Text>
                                </View>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </View>
        );
    };

    const renderProject = ({ item }: { item: ProjectWithTasks }) => (
        <View style={styles.projectCard}>
            <View style={styles.projectHeader}>
                <Text style={styles.projectName}>{item.name}</Text>
                <Text style={styles.taskCount}>{taskCountLabel(item.tasks.length)}</Text>
            </View>

            {item.description ? (
                <Text style={styles.projectDescription}>{item.description}</Text>
            ) : null}

            <View style={styles.projectDivider} />

            {item.tasks.length > 0 ? (
                item.tasks.map(renderTask)
            ) : (
                <Text style={styles.noTasks}>No tasks yet</Text>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Projects</Text>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={theme.text} />
                </View>
            ) : error ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>Something went wrong</Text>
                    <Text style={styles.emptySubtitle}>{error}</Text>
                </View>
            ) : (
                <FlatList
                    data={projects}
                    keyExtractor={(project) => project.id}
                    renderItem={renderProject}
                    contentContainerStyle={styles.list}
                    ItemSeparatorComponent={() => <View style={styles.projectGap} />}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => void load("refresh")}
                            tintColor={theme.text}
                            colors={[theme.text]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>No Projects</Text>
                            <Text style={styles.emptySubtitle}>
                                Your projects will show up here.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        header: {
            paddingHorizontal: 16,
            paddingTop: 6,
        },
        headerTitle: {
            fontSize: 34,
            fontWeight: "700",
            letterSpacing: -0.6,
            color: theme.text,
        },
        list: {
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 20,
        },
        projectGap: {
            height: 12,
        },
        projectCard: {
            padding: 16,
            borderRadius: 14,
            backgroundColor: theme.inputBackground,
        },
        projectHeader: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
        },
        projectName: {
            flex: 1,
            fontSize: 18,
            fontWeight: "700",
            color: theme.text,
        },
        taskCount: {
            marginTop: 2,
            fontSize: 13,
            color: theme.placeholder,
        },
        projectDescription: {
            marginTop: 6,
            fontSize: 15,
            lineHeight: 21,
            color: theme.placeholder,
        },
        projectDivider: {
            height: StyleSheet.hairlineWidth,
            marginVertical: 12,
            backgroundColor: theme.separator,
        },
        taskRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            paddingVertical: 6,
        },
        taskCheck: {
            width: 18,
            height: 18,
            marginTop: 1,
            borderRadius: 9,
            borderWidth: 1.5,
            borderColor: theme.placeholder,
            alignItems: "center",
            justifyContent: "center",
        },
        taskCheckCompleted: {
            borderColor: theme.sentBubble,
            backgroundColor: theme.sentBubble,
        },
        taskCheckMark: {
            fontSize: 11,
            lineHeight: 13,
            fontWeight: "700",
            color: theme.sentBubbleText,
        },
        taskContent: {
            flex: 1,
            minWidth: 0,
        },
        taskName: {
            fontSize: 15,
            fontWeight: "600",
            lineHeight: 20,
            color: theme.text,
        },
        taskNameCompleted: {
            color: theme.placeholder,
            textDecorationLine: "line-through",
        },
        taskDescription: {
            marginTop: 2,
            fontSize: 14,
            lineHeight: 19,
            color: theme.placeholder,
        },
        taskMeta: {
            marginTop: 7,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
        },
        metaChip: {
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 7,
            backgroundColor: theme.background,
        },
        metaChipCompleted: {
            opacity: 0.55,
        },
        metaText: {
            fontSize: 12,
            lineHeight: 16,
            fontWeight: "500",
            color: theme.placeholder,
        },
        metaTextOverdue: {
            fontWeight: "600",
            color: theme.error,
        },
        metaTextToday: {
            fontWeight: "600",
            color: theme.sentBubble,
        },
        noTasks: {
            fontSize: 14,
            color: theme.placeholder,
        },
        centered: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 32,
        },
        empty: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 6,
        },
        emptyTitle: {
            fontSize: 22,
            fontWeight: "600",
            color: theme.text,
            textAlign: "center",
        },
        emptySubtitle: {
            maxWidth: 280,
            fontSize: 15,
            lineHeight: 21,
            color: theme.placeholder,
            textAlign: "center",
        },
    });
