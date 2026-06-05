// Browser-only chat history persistence (localStorage).
// No authentication required.

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type DbMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  images: string[] | null;
  generated_image: string | null;
  created_at: string;
};

const CONV_KEY = "atena.conversations.v1";
const MSG_KEY = (cid: string) => `atena.messages.v1.${cid}`;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readConvs(): Conversation[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(CONV_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function writeConvs(list: Conversation[]) {
  if (!isBrowser()) return;
  localStorage.setItem(CONV_KEY, JSON.stringify(list));
}

function readMsgs(cid: string): DbMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(MSG_KEY(cid));
    return raw ? (JSON.parse(raw) as DbMessage[]) : [];
  } catch {
    return [];
  }
}

function writeMsgs(cid: string, list: DbMessage[]) {
  if (!isBrowser()) return;
  localStorage.setItem(MSG_KEY(cid), JSON.stringify(list));
}

function uid() {
  return (
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  );
}

export async function listConversations(): Promise<Conversation[]> {
  return readConvs().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function createConversation(title: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: uid(),
    title: title.slice(0, 80) || "Nova conversa",
    created_at: now,
    updated_at: now,
  };
  const list = readConvs();
  list.unshift(conv);
  writeConvs(list);
  return conv;
}

export async function renameConversation(id: string, title: string) {
  const list = readConvs().map((c) =>
    c.id === id ? { ...c, title: title.slice(0, 80) } : c,
  );
  writeConvs(list);
}

export async function touchConversation(id: string) {
  const now = new Date().toISOString();
  const list = readConvs().map((c) => (c.id === id ? { ...c, updated_at: now } : c));
  writeConvs(list);
}

export async function deleteConversation(id: string) {
  writeConvs(readConvs().filter((c) => c.id !== id));
  if (isBrowser()) localStorage.removeItem(MSG_KEY(id));
}

export async function listMessages(conversationId: string): Promise<DbMessage[]> {
  return readMsgs(conversationId);
}

export async function insertMessage(payload: {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  generated_image?: string;
}): Promise<DbMessage> {
  const msg: DbMessage = {
    id: uid(),
    conversation_id: payload.conversation_id,
    role: payload.role,
    content: payload.content,
    images: payload.images ?? null,
    generated_image: payload.generated_image ?? null,
    created_at: new Date().toISOString(),
  };
  const list = readMsgs(payload.conversation_id);
  list.push(msg);
  writeMsgs(payload.conversation_id, list);
  return msg;
}

export async function updateAssistantMessage(
  id: string,
  patch: { content?: string; generated_image?: string },
) {
  if (!isBrowser()) return;
  // We don't know conversation_id from id alone; scan all conversations.
  const convs = readConvs();
  for (const c of convs) {
    const list = readMsgs(c.id);
    const idx = list.findIndex((m) => m.id === id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.generated_image !== undefined
          ? { generated_image: patch.generated_image }
          : {}),
      };
      writeMsgs(c.id, list);
      return;
    }
  }
}
