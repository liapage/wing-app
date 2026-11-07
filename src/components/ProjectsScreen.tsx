import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SymbolView } from "expo-symbols";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import {
    createProjectTask,
    fetchProjectTasks,
    fetchProjects,
    updateProjectTask,
    WingdApiError,
    type Project,
    type Task,
    type UpdateProjectTaskInput,
} from "@/lib/wingd";
import { formatTaskDueDate, formatTaskRepeat } from "@/lib/taskSchedule";
import { useTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

type ProjectWithTasks = Project & {
    tasks: Task[];
};

type TaskEditField = "name" | "description";

type TaskEdit = {
    projectId: string;
    taskId: string;
    field: TaskEditField;
    value: string;
};

export default function ProjectsScreen() {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { refresh: refreshSession } = useAuth();

    const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [editing, setEditing] = useState<TaskEdit | null>(null);
    const [showCompleted, setShowCompleted] = useState<Record<string, boolean>>({});
    const [addingToProject, setAddingToProject] = useState<string | null>(null);
    const [newTaskName, setNewTaskName] = useState("");
    const [newTaskDescription, setNewTaskDescription] = useState("");
    const mounted = useRef(true);
    const addingTaskProject = useRef<string | null>(null);
    const newTaskFocused = useRef(false);
    const newTaskBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const submittingNewTask = useRef(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            if (newTaskBlurTimer.current) clearTimeout(newTaskBlurTimer.current);
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
            setActionError(null);

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

    const patchTask = (
        projectId: string,
        taskId: string,
        updates: Partial<Task>,
    ) => {
        setProjects((prev) =>
            prev.map((project) =>
                project.id !== projectId
                    ? project
                    : {
                          ...project,
                          tasks: project.tasks.map((task) =>
                              task.id === taskId ? { ...task, ...updates } : task,
                          ),
                      },
            ),
        );
    };

    const beginEditing = (
        projectId: string,
        task: Task,
        field: TaskEditField,
    ) => {
        setActionError(null);
        setEditing({
            projectId,
            taskId: task.id,
            field,
            value: field === "name" ? task.name : task.description,
        });
    };

    const stopEditing = (taskId: string, field: TaskEditField) => {
        setEditing((prev) =>
            prev && prev.taskId === taskId && prev.field === field ? null : prev,
        );
    };

    const commitEditing = async (
        projectId: string,
        taskId: string,
        field: TaskEditField,
        rawValue: string,
    ) => {
        stopEditing(taskId, field);

        const value = rawValue.trim();
        const task = projects
            .find((project) => project.id === projectId)
            ?.tasks.find((candidate) => candidate.id === taskId);

        if (!task) return;
        // The API rejects an empty name; leave the previous one in place.
        if (field === "name" && !value) return;
        if (task[field] === value) return;

        const previous = task[field];
        patchTask(projectId, taskId, { [field]: value });
        setActionError(null);

        try {
            const updated = await updateProjectTask(projectId, taskId, {
                [field]: value,
            } as UpdateProjectTaskInput);
            // Only apply the field we changed: another request (such as
            // completing the task) may have updated the row meanwhile.
            patchTask(projectId, taskId, { [field]: updated[field] });
        } catch (err) {
            patchTask(projectId, taskId, { [field]: previous });

            if (err instanceof WingdApiError && err.status === 401) {
                await refreshSession();
                return;
            }

            setActionError("Couldn't save your changes.");
        }
    };

    const toggleTaskCompletion = async (projectId: string, task: Task) => {
        const completed = !task.completed;

        Keyboard.dismiss();
        setActionError(null);
        setEditing((prev) => (prev?.taskId === task.id ? null : prev));
        patchTask(projectId, task.id, { completed });

        try {
            await updateProjectTask(projectId, task.id, { completed });
        } catch (err) {
            patchTask(projectId, task.id, { completed: task.completed });

            if (err instanceof WingdApiError && err.status === 401) {
                await refreshSession();
                return;
            }

            setActionError(
                completed
                    ? "Couldn't complete the task."
                    : "Couldn't reopen the task.",
            );
        }
    };

    const clearNewTaskBlurTimer = () => {
        if (newTaskBlurTimer.current) {
            clearTimeout(newTaskBlurTimer.current);
            newTaskBlurTimer.current = null;
        }
    };

    const closeNewTask = () => {
        clearNewTaskBlurTimer();
        addingTaskProject.current = null;
        newTaskFocused.current = false;
        setAddingToProject(null);
        setNewTaskName("");
        setNewTaskDescription("");
    };

    const beginAddingTask = (projectId: string) => {
        clearNewTaskBlurTimer();
        addingTaskProject.current = projectId;
        newTaskFocused.current = false;
        setActionError(null);
        setAddingToProject(projectId);
        setNewTaskName("");
        setNewTaskDescription("");
    };

    const submitNewTask = async (projectId: string) => {
        if (submittingNewTask.current) return;
        if (addingTaskProject.current !== projectId) return;

        const name = newTaskName.trim();
        const description = newTaskDescription.trim();
        const draftName = newTaskName;
        const draftDescription = newTaskDescription;

        closeNewTask();
        if (!name) return;

        submittingNewTask.current = true;
        setActionError(null);

        try {
            const task = await createProjectTask(projectId, { name, description });

            setProjects((prev) =>
                prev.map((project) =>
                    project.id === projectId
                        ? { ...project, tasks: [...project.tasks, task] }
                        : project,
                ),
            );
        } catch (err) {
            if (err instanceof WingdApiError && err.status === 401) {
                await refreshSession();
                return;
            }

            // Keep the draft so the text isn't lost when a save fails.
            addingTaskProject.current = projectId;
            setAddingToProject(projectId);
            setNewTaskName(draftName);
            setNewTaskDescription(draftDescription);
            setActionError("Couldn't add the task.");
        } finally {
            submittingNewTask.current = false;
        }
    };

    const handleNewTaskFocus = () => {
        newTaskFocused.current = true;
        clearNewTaskBlurTimer();
    };

    const handleNewTaskBlur = (projectId: string) => {
        newTaskFocused.current = false;
        clearNewTaskBlurTimer();
        // A blur fires before the next field gains focus, so wait briefly
        // before treating it as the end of the draft.
        newTaskBlurTimer.current = setTimeout(() => {
            newTaskBlurTimer.current = null;
            if (newTaskFocused.current) return;
            if (addingTaskProject.current !== projectId) return;
            void submitNewTask(projectId);
        }, 100);
    };

    const renderAddTask = (projectId: string) => {
        if (addingToProject === projectId) {
            return (
                <View style={styles.taskRow}>
                    <View style={styles.taskCheck} />
                    <View style={styles.taskContent}>
                        <TextInput
                            value={newTaskName}
                            onChangeText={setNewTaskName}
                            placeholder="Task title"
                            placeholderTextColor={theme.placeholder}
                            style={[styles.taskName, styles.taskNameInput]}
                            autoFocus
                            returnKeyType="done"
                            onFocus={handleNewTaskFocus}
                            onBlur={() => handleNewTaskBlur(projectId)}
                            accessibilityLabel="New task title"
                        />
                        <TextInput
                            value={newTaskDescription}
                            onChangeText={setNewTaskDescription}
                            placeholder="Add description"
                            placeholderTextColor={theme.placeholder}
                            style={[styles.taskDescription, styles.taskDescriptionInput]}
                            multiline
                            returnKeyType="done"
                            submitBehavior="blurAndSubmit"
                            onFocus={handleNewTaskFocus}
                            onBlur={() => handleNewTaskBlur(projectId)}
                            accessibilityLabel="New task description"
                        />
                    </View>
                </View>
            );
        }

        return (
            <Pressable
                onPress={() => beginAddingTask(projectId)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Add task"
                style={({ pressed }) => [
                    styles.addTaskRow,
                    pressed && styles.addTaskRowPressed,
                ]}
            >
                <SymbolView
                    name={{ ios: "plus", android: "add", web: "add" }}
                    size={16}
                    tintColor={theme.placeholder}
                />
                <Text style={styles.addTaskLabel}>Add task</Text>
            </Pressable>
        );
    };

    const renderTask = (projectId: string, task: Task) => {
        const due = formatTaskDueDate(task.due_at, task.timezone);
        const repeat = formatTaskRepeat(task.rrule, task.repeat_until, task.timezone);
        const scheduleLabel = [due?.text, repeat?.text].filter(Boolean).join(", ");
        const editingField =
            editing && editing.taskId === task.id ? editing.field : null;
        const editingValue =
            editing && editing.taskId === task.id ? editing.value : "";

        return (
            <View
                key={task.id}
                style={[styles.taskRow, task.completed && styles.taskRowCompleted]}
                accessibilityLabel={`${task.name}${task.completed ? ", completed" : ""}${
                    scheduleLabel ? `, ${scheduleLabel}` : ""
                }`}
            >
                <Pressable
                    onPress={() => void toggleTaskCompletion(projectId, task)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: task.completed }}
                    accessibilityLabel={
                        task.completed
                            ? `Mark ${task.name} as not completed`
                            : `Complete ${task.name}`
                    }
                    style={({ pressed }) => [
                        styles.taskCheck,
                        task.completed && styles.taskCheckCompleted,
                        pressed && styles.taskCheckPressed,
                    ]}
                >
                    {task.completed ? (
                        <Text style={styles.taskCheckMark}>✓</Text>
                    ) : null}
                </Pressable>
                <View style={styles.taskContent}>
                    {editingField === "name" ? (
                        <TextInput
                            value={editingValue}
                            onChangeText={(value) =>
                                setEditing((prev) =>
                                    prev &&
                                    prev.taskId === task.id &&
                                    prev.field === "name"
                                        ? { ...prev, value }
                                        : prev,
                                )
                            }
                            autoFocus
                            selectTextOnFocus
                            returnKeyType="done"
                            style={[styles.taskName, styles.taskNameInput]}
                            onBlur={() =>
                                void commitEditing(
                                    projectId,
                                    task.id,
                                    "name",
                                    editingValue,
                                )
                            }
                            accessibilityLabel="Task title"
                        />
                    ) : (
                        <Pressable
                            onPress={() => beginEditing(projectId, task, "name")}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit title of ${task.name}`}
                        >
                            <Text
                                style={[
                                    styles.taskName,
                                    task.completed && styles.taskNameCompleted,
                                ]}
                            >
                                {task.name}
                            </Text>
                        </Pressable>
                    )}

                    {editingField === "description" ? (
                        <TextInput
                            value={editingValue}
                            onChangeText={(value) =>
                                setEditing((prev) =>
                                    prev &&
                                    prev.taskId === task.id &&
                                    prev.field === "description"
                                        ? { ...prev, value }
                                        : prev,
                                )
                            }
                            autoFocus
                            multiline
                            returnKeyType="done"
                            submitBehavior="blurAndSubmit"
                            placeholder="Add description"
                            placeholderTextColor={theme.placeholder}
                            style={[
                                styles.taskDescription,
                                styles.taskDescriptionInput,
                            ]}
                            onBlur={() =>
                                void commitEditing(
                                    projectId,
                                    task.id,
                                    "description",
                                    editingValue,
                                )
                            }
                            accessibilityLabel="Task description"
                        />
                    ) : task.description ? (
                        <Pressable
                            onPress={() =>
                                beginEditing(projectId, task, "description")
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Edit description of ${task.name}`}
                        >
                            <Text style={styles.taskDescription}>
                                {task.description}
                            </Text>
                        </Pressable>
                    ) : editingField ? (
                        <Pressable
                            onPress={() =>
                                beginEditing(projectId, task, "description")
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Add description to ${task.name}`}
                        >
                            <Text
                                style={[
                                    styles.taskDescription,
                                    styles.taskDescriptionPlaceholder,
                                ]}
                            >
                                Add description
                            </Text>
                        </Pressable>
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

    const renderProject = ({ item }: { item: ProjectWithTasks }) => {
        const activeTasks = item.tasks.filter((task) => !task.completed);
        const completedTasks = item.tasks.filter((task) => task.completed);
        const isShowingCompleted = showCompleted[item.id] ?? false;
        const visibleTasks = isShowingCompleted
            ? [...activeTasks, ...completedTasks]
            : activeTasks;

        return (
            <View style={styles.projectCard}>
                <View style={styles.projectHeader}>
                    <Text style={styles.projectName}>{item.name}</Text>
                    <Pressable
                        onPress={() => {
                            Keyboard.dismiss();
                            setShowCompleted((prev) => ({
                                ...prev,
                                [item.id]: !isShowingCompleted,
                            }));
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isShowingCompleted }}
                        accessibilityLabel={
                            isShowingCompleted
                                ? `Hide completed tasks in ${item.name}`
                                : `Show completed tasks in ${item.name}`
                        }
                        style={({ pressed }) => [
                            styles.completedToggle,
                            isShowingCompleted && styles.completedToggleActive,
                            pressed && styles.completedTogglePressed,
                        ]}
                    >
                        <SymbolView
                            name={{
                                ios: isShowingCompleted ? "eye" : "eye.slash",
                                android: isShowingCompleted
                                    ? "visibility"
                                    : "visibility_off",
                                web: isShowingCompleted
                                    ? "visibility"
                                    : "visibility_off",
                            }}
                            size={18}
                            tintColor={
                                isShowingCompleted ? theme.text : theme.placeholder
                            }
                        />
                    </Pressable>
                </View>

                {item.description ? (
                    <Text style={styles.projectDescription}>{item.description}</Text>
                ) : null}

                <View style={styles.projectDivider} />

                {visibleTasks.map((task) => renderTask(item.id, task))}

                {renderAddTask(item.id)}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Projects</Text>
                {actionError ? (
                    <Text style={styles.actionError}>{actionError}</Text>
                ) : null}
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
        screen: {
            flex: 1,
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
        actionError: {
            marginTop: 4,
            fontSize: 13,
            lineHeight: 18,
            color: theme.error,
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
        completedToggle: {
            marginTop: 1,
            padding: 4,
            borderRadius: 8,
        },
        completedToggleActive: {
            backgroundColor: theme.background,
        },
        completedTogglePressed: {
            opacity: 0.55,
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
        taskRowCompleted: {
            opacity: 0.6,
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
        taskCheckPressed: {
            opacity: 0.55,
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
        taskNameInput: {
            paddingHorizontal: 0,
            paddingVertical: 0,
            minHeight: 20,
        },
        taskDescription: {
            marginTop: 2,
            fontSize: 14,
            lineHeight: 19,
            color: theme.placeholder,
        },
        taskDescriptionInput: {
            paddingHorizontal: 0,
            paddingVertical: 0,
            minHeight: 19,
            maxHeight: 140,
            textAlignVertical: "top",
        },
        taskDescriptionPlaceholder: {
            fontStyle: "italic",
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
        addTaskRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            paddingVertical: 8,
        },
        addTaskRowPressed: {
            opacity: 0.55,
        },
        addTaskLabel: {
            fontSize: 14,
            fontWeight: "500",
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
