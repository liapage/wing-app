// Human-friendly rendering for task scheduling data. Tasks carry an RFC 3339
// due timestamp, an IANA timezone, and an iCalendar RRULE (plus an optional
// repetition end date), so both need a little formatting before they belong in
// a compact task row.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEEKDAYS: Record<string, string> = {
    SU: "Sun",
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
};

const WEEKDAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

const ORDINALS = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
];

export type TaskDueDate = {
    /** Ready-to-display text, e.g. "Due today at 5:00 PM". */
    text: string;
    /** Drives emphasis: overdue is red, today uses the accent colour. */
    tone: "overdue" | "today" | "normal";
};

export type TaskRepeat = {
    /** Ready-to-display text, e.g. "Repeats weekly on Mon, Wed". */
    text: string;
};

function normalizeTimeZone(timeZone?: string | null): string | undefined {
    if (!timeZone) return undefined;

    try {
        new Intl.DateTimeFormat(undefined, { timeZone }).format(new Date());
        return timeZone;
    } catch {
        return undefined;
    }
}

type ZonedDateParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
};

function zonedParts(date: Date, timeZone?: string): ZonedDateParts {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });

    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(date)) {
        if (part.type !== "literal") parts[part.type] = part.value;
    }

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    };
}

function dayIndex(parts: ZonedDateParts): number {
    return Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY;
}

function formatCalendarDate(date: Date, timeZone: string | undefined, now: Date): string {
    const parts = zonedParts(date, timeZone);
    const today = zonedParts(now, timeZone);

    const month = MONTHS[parts.month - 1] ?? "";
    const day = `${parts.day}`;
    const year =
        parts.year === today.year ? "" : `, ${parts.year}`;

    return `${month} ${day}${year}`;
}

function formatTime(date: Date, timeZone: string | undefined): string | null {
    const parts = zonedParts(date, timeZone);
    // Midnight usually means "this is a date-only deadline"; showing 12:00 AM
    // would add noise rather than information.
    if (parts.hour === 0 && parts.minute === 0) return null;

    return date.toLocaleTimeString(undefined, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
}

/**
 * Formats a task's due timestamp relative to `now`, in the task's own timezone
 * so a late-evening due date doesn't silently shift to the next day.
 */
export function formatTaskDueDate(
    dueAt: string | null | undefined,
    timeZone?: string | null,
    now: Date = new Date(),
): TaskDueDate | null {
    if (!dueAt) return null;

    const date = new Date(dueAt);
    // A zero-value timestamp from Go (0001-01-01) means "no due date".
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return null;

    const tz = normalizeTimeZone(timeZone);
    const due = zonedParts(date, tz);
    const today = zonedParts(now, tz);
    const dayDelta = dayIndex(due) - dayIndex(today);

    let label: string;
    switch (dayDelta) {
        case 0:
            label = "today";
            break;
        case 1:
            label = "tomorrow";
            break;
        case -1:
            label = "yesterday";
            break;
        default:
            if (dayDelta > 1 && dayDelta < 7) {
                label = date.toLocaleDateString(undefined, {
                    timeZone: tz,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    ...(due.year === today.year ? {} : { year: "numeric" }),
                });
            } else {
                label = formatCalendarDate(date, tz, now);
            }
    }

    const time = formatTime(date, tz);
    const timeSuffix = time ? ` at ${time}` : "";
    const overdue = date.getTime() < now.getTime();

    if (overdue) {
        // The label is lowercase in the regular "Due today" phrasing; after the
        // "Overdue ·" separator it starts a new clause and needs a capital.
        const displayLabel =
            label === "today" || label === "yesterday"
                ? label.charAt(0).toUpperCase() + label.slice(1)
                : label;

        return {
            text: `Overdue · ${displayLabel}${timeSuffix}`,
            tone: "overdue",
        };
    }

    return {
        text: `Due ${label}${timeSuffix}`,
        tone: dayDelta === 0 ? "today" : "normal",
    };
}

type ParsedRRule = Map<string, string>;

function parseRRule(rrule: string): ParsedRRule | null {
    const rule = rrule.trim().replace(/^RRULE:/i, "");
    if (!rule) return null;

    const fields: ParsedRRule = new Map();
    for (const entry of rule.split(";")) {
        const separator = entry.indexOf("=");
        if (separator <= 0) continue;

        const key = entry.slice(0, separator).trim().toUpperCase();
        const value = entry.slice(separator + 1).trim();
        if (key && value) fields.set(key, value);
    }

    return fields.has("FREQ") ? fields : null;
}

function positiveInt(value: string | undefined, fallback = 1): number {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function weekdayCode(value: string): string {
    return value.replace(/^[+-]?\d+/, "").toUpperCase();
}

function formatWeekdayList(value: string): string {
    const codes = value
        .split(",")
        .map(weekdayCode)
        .filter((code) => code in WEEKDAYS)
        .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));

    return codes.map((code) => WEEKDAYS[code]).join(", ");
}

function ordinalWord(value: number): string {
    if (value >= 1 && value <= ORDINALS.length) return ORDINALS[value - 1];
    return `${value}th`;
}

function ordinalSuffix(value: number): string {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return "th";

    switch (value % 10) {
        case 1:
            return "st";
        case 2:
            return "nd";
        case 3:
            return "rd";
        default:
            return "th";
    }
}

function formatMonthDay(month: number, day: number): string {
    const monthName = MONTHS[month - 1];
    return monthName ? `${monthName} ${day}` : `${month}-${day}`;
}

function formatMonthDayList(value: string): string {
    const days = value
        .split(",")
        .map((part) => Number.parseInt(part, 10))
        .filter((day) => Number.isFinite(day) && day !== 0);

    const labels = days.map((day) => {
        if (day === -1) return "last day";
        if (day < 0) return `${Math.abs(day)}${ordinalSuffix(Math.abs(day))}-to-last day`;
        return `${day}${ordinalSuffix(day)}`;
    });

    if (labels.length === 0) return "";
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function formatMonthlyByDay(value: string): string {
    const labels = value
        .split(",")
        .map((token) => token.trim().toUpperCase())
        .map((token) => {
            const match = token.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
            if (!match) return "";
            const [, ordinal, code] = match;
            const weekday = WEEKDAYS[code] ?? code;
            if (!ordinal) return `on ${weekday}s`;

            const parsed = Number.parseInt(ordinal, 10);
            if (parsed === -1) return `on the last ${weekday}`;
            if (parsed > 0) return `on the ${ordinalWord(parsed)} ${weekday}`;
            return `on the ${Math.abs(parsed)}${ordinalSuffix(Math.abs(parsed))} last ${weekday}`;
        })
        .filter(Boolean);

    return labels.join(", ");
}

function formatYearlyDate(fields: ParsedRRule): string {
    const byMonth = fields.get("BYMONTH");
    const byMonthDay = fields.get("BYMONTHDAY");

    const month = byMonth
        ?.split(",")
        .map((value) => Number.parseInt(value, 10))
        .find((value) => Number.isFinite(value) && value >= 1 && value <= 12);
    const day = byMonthDay
        ?.split(",")
        .map((value) => Number.parseInt(value, 10))
        .find((value) => Number.isFinite(value) && value > 0);

    if (month && day) return ` on ${formatMonthDay(month, day)}`;
    if (month) return ` in ${MONTHS[month - 1]}`;
    return "";
}

function parseRuleUntil(value: string): Date | null {
    const trimmed = value.trim();

    const utc = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (utc) {
        const [, year, month, day, hour, minute, second] = utc;
        return new Date(
            Date.UTC(
                Number(year),
                Number(month) - 1,
                Number(day),
                Number(hour),
                Number(minute),
                Number(second),
            ),
        );
    }

    const local = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/);
    if (local) {
        const [, year, month, day, hour = "0", minute = "0", second = "0"] = local;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        );
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return null;
    return date;
}

/**
 * Turns an iCalendar RRULE into a short sentence ("Repeats weekly on Mon,
 * Wed"). Returns null when there is no rule; unknown schedules get a safe
 * fallback instead of leaking raw rule text into the UI.
 */
export function formatTaskRepeat(
    rrule: string | null | undefined,
    repeatUntil?: string | null,
    timeZone?: string | null,
    now: Date = new Date(),
): TaskRepeat | null {
    if (!rrule || !rrule.trim()) return null;

    const tz = normalizeTimeZone(timeZone);
    const fields = parseRRule(rrule);
    const frequency = fields?.get("FREQ")?.toUpperCase();

    if (!fields || !frequency) {
        return { text: "Repeats on a custom schedule" };
    }

    const interval = positiveInt(fields.get("INTERVAL"));

    let text: string;
    switch (frequency) {
        case "DAILY":
            text =
                interval === 1
                    ? "Repeats daily"
                    : `Repeats every ${interval} days`;
            break;
        case "WEEKLY": {
            const weekdays = fields.get("BYDAY");
            const days = weekdays ? formatWeekdayList(weekdays) : "";
            const base =
                interval === 1
                    ? "Repeats weekly"
                    : `Repeats every ${interval} weeks`;
            text = days ? `${base} on ${days}` : base;
            break;
        }
        case "MONTHLY": {
            const base =
                interval === 1
                    ? "Repeats monthly"
                    : `Repeats every ${interval} months`;
            const byDay = fields.get("BYDAY");
            const byMonthDay = fields.get("BYMONTHDAY");

            if (byDay) {
                text = `${base} ${formatMonthlyByDay(byDay)}`;
            } else if (byMonthDay) {
                const days = formatMonthDayList(byMonthDay);
                text = days ? `${base} on the ${days}` : base;
            } else {
                text = base;
            }
            break;
        }
        case "YEARLY":
            text =
                interval === 1
                    ? "Repeats yearly"
                    : `Repeats every ${interval} years`;
            text += formatYearlyDate(fields);
            break;
        case "HOURLY":
            text =
                interval === 1
                    ? "Repeats hourly"
                    : `Repeats every ${interval} hours`;
            break;
        case "MINUTELY":
            text =
                interval === 1
                    ? "Repeats every minute"
                    : `Repeats every ${interval} minutes`;
            break;
        case "SECONDLY":
            text =
                interval === 1
                    ? "Repeats every second"
                    : `Repeats every ${interval} seconds`;
            break;
        default:
            return { text: "Repeats on a custom schedule" };
    }

    const count = fields.get("COUNT");
    if (count) {
        const times = positiveInt(count, 0);
        if (times > 0) text += ` · ${times} ${times === 1 ? "time" : "times"}`;
    }

    const untilValue = repeatUntil?.trim() || fields.get("UNTIL")?.trim();
    if (untilValue) {
        const until = parseRuleUntil(untilValue);
        if (until) {
            text += ` · until ${formatCalendarDate(until, tz, now)}`;
        }
    }

    return { text };
}
