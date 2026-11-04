// A small, intentionally limited markdown parser for chat messages. It covers
// the formatting people actually type in conversations — emphasis, inline and
// fenced code, links, quotes and lists — and deliberately skips HTML, images
// and full CommonMark edge cases.

export type InlineNode =
    | { type: "text"; value: string }
    | { type: "code"; value: string }
    | { type: "strong"; children: InlineNode[] }
    | { type: "em"; children: InlineNode[] }
    | { type: "strike"; children: InlineNode[] }
    | { type: "link"; href: string; children: InlineNode[] };

export type MarkdownBlock =
    | { type: "paragraph"; content: InlineNode[] }
    | { type: "heading"; level: number; content: InlineNode[] }
    | { type: "code"; language?: string; value: string }
    | { type: "quote"; blocks: MarkdownBlock[] }
    | { type: "list"; ordered: boolean; start: number; items: InlineNode[][] }
    | { type: "rule" };

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BARE_URL = /^https?:\/\/[^\s<>]+/i;
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~>|]/;
const TRAILING_URL_PUNCTUATION = /[.,!?;:'"”’]+$/;

// Messages come from other people, so keep nesting bounded instead of letting
// a pathological message exhaust the JS stack.
const MAX_INLINE_DEPTH = 24;
const MAX_QUOTE_DEPTH = 12;

function isWhitespace(value: string | undefined): boolean {
    return value === undefined || value === "" || /\s/.test(value);
}

function isWordCharacter(value: string | undefined): boolean {
    return value !== undefined && /[A-Za-z0-9]/.test(value);
}

function isEscaped(text: string, index: number): boolean {
    let backslashes = 0;

    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
        backslashes += 1;
    }

    return backslashes % 2 === 1;
}

function countUnescaped(text: string, character: string): number {
    let count = 0;

    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === character && !isEscaped(text, index)) count += 1;
    }

    return count;
}

function pushText(nodes: InlineNode[], value: string) {
    if (!value) return;

    const last = nodes[nodes.length - 1];
    if (last?.type === "text") {
        last.value += value;
        return;
    }

    nodes.push({ type: "text", value });
}

function safeHref(raw: string): string | undefined {
    const value = raw.trim().replace(/^<|>$/g, "");
    if (!value || /\s/.test(value) || value.startsWith("//") || /^[/#?]/.test(value)) {
        return undefined;
    }

    const lower = value.toLowerCase();
    if (
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("mailto:")
    ) {
        return value;
    }

    const looksLikeHost =
        /^(?:www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$))/i.test(value) ||
        /^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#]|$)/i.test(value);

    return looksLikeHost ? `https://${value}` : undefined;
}

function trimUrl(raw: string): string {
    let value = raw.replace(TRAILING_URL_PUNCTUATION, "");

    // Keep a closing parenthesis when it balances one inside the URL, which
    // happens with links such as https://en.wikipedia.org/wiki/Foo_(bar).
    while (value.endsWith(")")) {
        const opens = (value.match(/\(/g) ?? []).length;
        const closes = (value.match(/\)/g) ?? []).length;
        if (closes <= opens) break;
        value = value.slice(0, -1);
    }

    return value;
}

type Delimiter = {
    token: string;
    type: "strong" | "em" | "strike" | "strongEm";
};

const DELIMITERS: Delimiter[] = [
    { token: "***", type: "strongEm" },
    { token: "___", type: "strongEm" },
    { token: "**", type: "strong" },
    { token: "__", type: "strong" },
    { token: "~~", type: "strike" },
    { token: "*", type: "em" },
    { token: "_", type: "em" },
];

function findClosingDelimiter(
    text: string,
    from: number,
    delimiter: Delimiter,
): number | undefined {
    let cursor = from;

    while (cursor < text.length) {
        const close = text.indexOf(delimiter.token, cursor);
        if (close === -1) return undefined;

        const content = text.slice(from, close);
        const validContent =
            content.length > 0 &&
            !isWhitespace(content[0]) &&
            !isWhitespace(content[content.length - 1]);

        const validClose =
            !isEscaped(text, close) &&
            (delimiter.token[0] !== "_" ||
                !isWordCharacter(text[close + delimiter.token.length]));

        if (validContent && validClose) {
            // A run of three closing characters (as in "**bold *italic***")
            // can close both the outer pair and an inner emphasis span. Borrow
            // one character for the content when that balances the delimiters.
            if (
                delimiter.token.length === 2 &&
                text[close + 1] === delimiter.token[0] &&
                text[close + 2] === delimiter.token[0]
            ) {
                const character = delimiter.token[0];
                const withoutExtra = countUnescaped(content, character);
                const withExtra = countUnescaped(content + character, character);

                if (withoutExtra % 2 === 1 && withExtra % 2 === 0) {
                    return close + 1;
                }
            }

            return close;
        }

        cursor = close + 1;
    }

    return undefined;
}

function wrapDelimiter(delimiter: Delimiter, children: InlineNode[]): InlineNode {
    if (delimiter.type === "strongEm") {
        return { type: "strong", children: [{ type: "em", children }] };
    }

    return { type: delimiter.type, children };
}

function tryLink(
    text: string,
    start: number,
    depth: number,
): { href: string; children: InlineNode[]; end: number } | undefined {
    const labelEnd = text.indexOf("]", start + 1);
    if (labelEnd === -1 || text[labelEnd + 1] !== "(") return undefined;

    let parenthesisDepth = 1;
    let end = -1;

    for (let cursor = labelEnd + 2; cursor < text.length; cursor += 1) {
        if (isEscaped(text, cursor)) continue;

        if (text[cursor] === "(") {
            parenthesisDepth += 1;
        } else if (text[cursor] === ")") {
            parenthesisDepth -= 1;
            if (parenthesisDepth === 0) {
                end = cursor;
                break;
            }
        }
    }

    if (end === -1) return undefined;

    const href = safeHref(text.slice(labelEnd + 2, end));
    if (!href) return undefined;

    return {
        href,
        children: parseInline(text.slice(start + 1, labelEnd), depth + 1),
        end: end + 1,
    };
}

function parseInline(text: string, depth = 0): InlineNode[] {
    if (depth >= MAX_INLINE_DEPTH) {
        return [{ type: "text", value: text }];
    }

    const nodes: InlineNode[] = [];
    let index = 0;

    while (index < text.length) {
        const character = text[index];

        if (character === "\\") {
            const next = text[index + 1];
            if (next !== undefined && ESCAPABLE.test(next)) {
                pushText(nodes, next);
                index += 2;
            } else {
                pushText(nodes, character);
                index += 1;
            }
            continue;
        }

        if (character === "`") {
            let runLength = 1;
            while (text[index + runLength] === "`") runLength += 1;

            const fence = "`".repeat(runLength);
            const close = text.indexOf(fence, index + runLength);
            if (close === -1) {
                pushText(nodes, fence);
                index += runLength;
                continue;
            }

            let value = text.slice(index + runLength, close);
            if (
                value.length > 2 &&
                value.startsWith(" ") &&
                value.endsWith(" ")
            ) {
                value = value.slice(1, -1);
            }

            nodes.push({ type: "code", value });
            index = close + runLength;
            continue;
        }

        if (character === "[") {
            const link = tryLink(text, index, depth);

            if (link) {
                nodes.push({ type: "link", href: link.href, children: link.children });
                index = link.end;
                continue;
            }
        }

        if (character === "<") {
            const match = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/i.exec(text.slice(index));
            const href = match ? safeHref(match[1]) : undefined;

            if (match && href) {
                nodes.push({
                    type: "link",
                    href,
                    children: [{ type: "text", value: match[1] }],
                });
                index += match[0].length;
                continue;
            }
        }

        if (character === "!" && text[index + 1] === "[") {
            const link = tryLink(text, index + 1, depth);

            if (link) {
                nodes.push({ type: "link", href: link.href, children: link.children });
                index = link.end;
                continue;
            }
        }

        if (
            (character === "h" || character === "H") &&
            (index === 0 || isWhitespace(text[index - 1]) || "([{<".includes(text[index - 1]))
        ) {
            const match = BARE_URL.exec(text.slice(index));
            if (match) {
                const url = trimUrl(match[0]);
                const href = safeHref(url);

                if (href && url.length > "https://".length) {
                    nodes.push({
                        type: "link",
                        href,
                        children: [{ type: "text", value: url }],
                    });
                    index += url.length;
                    continue;
                }
            }
        }

        let matched = false;
        for (const delimiter of DELIMITERS) {
            if (!text.startsWith(delimiter.token, index)) continue;

            const token = delimiter.token;
            const after = text[index + token.length];
            const before = text[index - 1];

            // Underscores inside words (snake_case) are not emphasis.
            if (token[0] === "_" && isWordCharacter(before) && isWordCharacter(after)) {
                continue;
            }

            const close = findClosingDelimiter(text, index + token.length, delimiter);
            if (close === undefined) continue;

            const children = parseInline(
                text.slice(index + token.length, close),
                depth + 1,
            );
            nodes.push(wrapDelimiter(delimiter, children));
            index = close + token.length;
            matched = true;
            break;
        }

        if (matched) continue;

        pushText(nodes, character);
        index += 1;
    }

    return nodes;
}

function startsBlock(line: string): boolean {
    return (
        FENCE.test(line) ||
        HEADING.test(line) ||
        RULE.test(line) ||
        QUOTE.test(line) ||
        LIST_ITEM.test(line)
    );
}

function parseList(
    lines: string[],
    startIndex: number,
): { block: MarkdownBlock; next: number } {
    const first = LIST_ITEM.exec(lines[startIndex]);
    const marker = first?.[2] ?? "-";
    const ordered = /^\d/.test(marker);
    const start = ordered ? Number.parseInt(marker, 10) : 1;
    const contents: string[][] = [];
    let current: string[] = [];
    let index = startIndex;

    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) break;

        const item = LIST_ITEM.exec(line);
        if (item) {
            const itemOrdered = /^\d/.test(item[2]);
            if (itemOrdered !== ordered) break;

            if (current.length > 0) contents.push(current);
            current = [(item[3] ?? "").trim()];
            index += 1;
            continue;
        }

        if (/^\s+/.test(line) && !RULE.test(line)) {
            current.push(line.trim());
            index += 1;
            continue;
        }

        if (startsBlock(line)) break;

        current.push(line.trim());
        index += 1;
    }

    if (current.length > 0) contents.push(current);

    return {
        block: {
            type: "list",
            ordered,
            start,
            items: contents.map((linesForItem) =>
                parseInline(linesForItem.filter(Boolean).join("\n")),
            ),
        },
        next: index,
    };
}

export function parseMarkdown(source: string): MarkdownBlock[] {
    return parseBlocks(source, 0);
}

function parseBlocks(source: string, depth: number): MarkdownBlock[] {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const blocks: MarkdownBlock[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (!line.trim()) {
            index += 1;
            continue;
        }

        const fence = FENCE.exec(line);
        if (fence) {
            const fenceCharacter = fence[1][0];
            const fenceLength = fence[1].length;
            const language = fence[2].trim().split(/\s+/)[0] || undefined;
            const content: string[] = [];
            let cursor = index + 1;

            while (cursor < lines.length) {
                const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[cursor]);
                if (
                    closing &&
                    closing[1][0] === fenceCharacter &&
                    closing[1].length >= fenceLength
                ) {
                    break;
                }

                content.push(lines[cursor]);
                cursor += 1;
            }

            blocks.push({
                type: "code",
                language,
                value: content.join("\n"),
            });
            index = cursor < lines.length ? cursor + 1 : cursor;
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            const content = heading[2].trim().replace(/[ \t]+#+[ \t]*$/, "");
            blocks.push({
                type: "heading",
                level: heading[1].length,
                content: parseInline(content),
            });
            index += 1;
            continue;
        }

        if (RULE.test(line)) {
            blocks.push({ type: "rule" });
            index += 1;
            continue;
        }

        const quote = QUOTE.exec(line);
        if (quote) {
            const quoted: string[] = [];
            let cursor = index;

            while (cursor < lines.length) {
                const quotedLine = QUOTE.exec(lines[cursor]);
                if (!quotedLine) break;

                quoted.push(quotedLine[1]);
                cursor += 1;
            }

            blocks.push({
                type: "quote",
                blocks:
                    depth >= MAX_QUOTE_DEPTH
                        ? [
                              {
                                  type: "paragraph",
                                  content: parseInline(quoted.join("\n")),
                              },
                          ]
                        : parseBlocks(quoted.join("\n"), depth + 1),
            });
            index = cursor;
            continue;
        }

        if (LIST_ITEM.test(line)) {
            const { block, next } = parseList(lines, index);
            blocks.push(block);
            index = next;
            continue;
        }

        const paragraph: string[] = [];
        while (index < lines.length) {
            const current = lines[index];
            if (!current.trim()) break;
            if (paragraph.length > 0 && startsBlock(current)) break;

            paragraph.push(current.trim());
            index += 1;
        }

        blocks.push({ type: "paragraph", content: parseInline(paragraph.join("\n")) });
    }

    return blocks;
}

function inlineToPlainText(nodes: InlineNode[]): string {
    return nodes
        .map((node) => {
            if (node.type === "text" || node.type === "code") return node.value;

            return inlineToPlainText(node.children);
        })
        .join("");
}

function blockToPlainText(block: MarkdownBlock): string {
    switch (block.type) {
        case "paragraph":
        case "heading":
            return inlineToPlainText(block.content);
        case "code":
            return block.value;
        case "quote":
            return block.blocks.map(blockToPlainText).join(" ");
        case "list":
            return block.items.map(inlineToPlainText).join(" ");
        case "rule":
            return "";
    }
}

// Chat-list previews and accessibility labels use markdown-free text so users
// see "hello" instead of "**hello**".
export function markdownToPlainText(source: string): string {
    return parseMarkdown(source)
        .map(blockToPlainText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}
