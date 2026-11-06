import { parseMarkdown } from "@/markdown/parse";
import type { ChatMessage } from "@/messaging/store";

export type ToolLanguage = "tooluse" | "toolerror";

export type ToolMessageInfo = {
    language: ToolLanguage;
    value: string;
};

// A renderable row in the chat list. Consecutive tool calls from the same
// sender collapse into a single `toolGroup` row.
export type ChatListItem =
    | { kind: "message"; key: string; message: ChatMessage }
    | {
          kind: "toolGroup";
          key: string;
          senderId: string | null;
          messages: ChatMessage[];
      };

function messageKey(message: ChatMessage): string {
    return message.localId ?? message.id;
}

// Agents emit tool calls as standalone fenced code blocks. A message that also
// contains prose (or any other markdown) stays a normal chat message.
export function toolMessageInfo(
    message: ChatMessage,
): ToolMessageInfo | undefined {
    const blocks = parseMarkdown(message.text);
    if (blocks.length !== 1) return undefined;

    const block = blocks[0];
    if (block.type !== "code") return undefined;

    const language = block.language?.toLowerCase();
    if (language !== "tooluse" && language !== "toolerror") return undefined;

    return { language, value: block.value };
}

export function buildChatListItems(
    messages: readonly ChatMessage[],
): ChatListItem[] {
    const items: ChatListItem[] = [];

    for (const message of messages) {
        if (!toolMessageInfo(message)) {
            items.push({ kind: "message", key: messageKey(message), message });
            continue;
        }

        const previous = items[items.length - 1];
        if (previous?.kind === "toolGroup" && previous.senderId === message.sender_id) {
            previous.messages.push(message);
            // Keep the group keyed by its newest message. A new tool call then
            // remounts the row, collapsing it back to the latest block.
            previous.key = `tool-group:${messageKey(message)}`;
            continue;
        }

        items.push({
            kind: "toolGroup",
            key: `tool-group:${messageKey(message)}`,
            senderId: message.sender_id,
            messages: [message],
        });
    }

    return items;
}
