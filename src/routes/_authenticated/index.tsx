import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  ImagePlus,
  X,
  Wand2,
  MessageSquare,
  Loader2,
  Menu,
  Plus,
  LogOut,
  Trash2,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AuroraBackground } from "@/components/atena/AuroraBackground";
import { Message, type AtenaMessage } from "@/components/atena/Message";
import { streamChat, streamImage } from "@/lib/atena-stream";
import { supabase } from "@/integrations/supabase/client";
import {
  type Conversation,
  createConversation,
  deleteConversation,
  insertMessage,
  listConversations,
  listMessages,
  renameConversation,
  touchConversation,
  updateAssistantMessage,
} from "@/lib/chat-db";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Atena — IA Multimodal" },
      { name: "description", content: "Converse, analise imagens e gere arte com Atena." },
    ],
  }),
  component: AtenaChat,
});

type Mode = "chat" | "image";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function AtenaChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AtenaMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? "");
      const list = await listConversations().catch(() => []);
      setConversations(list);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    try {
      const rows = await listMessages(id);
      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          images: r.images ?? undefined,
          generatedImage: r.generated_image
            ? { dataUrl: r.generated_image, isFinal: true }
            : undefined,
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar mensagens");
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setSidebarOpen(false);
  };

  const removeConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) newChat();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const handleAttach = async (files: FileList | null) => {
    if (!files) return;
    const imgs: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`Imagem ${f.name} excede 8MB`);
        continue;
      }
      imgs.push(await fileToDataURL(f));
    }
    setAttachments((prev) => [...prev, ...imgs].slice(0, 4));
  };

  const ensureConversation = async (firstText: string): Promise<string> => {
    if (activeId) return activeId;
    const conv = await createConversation(firstText || "Nova conversa");
    setActiveId(conv.id);
    setConversations((prev) => [conv, ...prev]);
    return conv.id;
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text && attachments.length === 0) return;
    if (isLoading) return;

    setIsLoading(true);
    const localUserId = uid();
    const userMsg: AtenaMessage = {
      id: localUserId,
      role: "user",
      content: text,
      images: attachments.length ? attachments : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const sentAttachments = attachments;
    setAttachments([]);

    let conversationId: string;
    try {
      conversationId = await ensureConversation(text);
      await insertMessage({
        conversation_id: conversationId,
        role: "user",
        content: text,
        images: sentAttachments,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar mensagem");
      setIsLoading(false);
      return;
    }

    if (mode === "image") {
      const assistantLocalId = uid();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantLocalId,
          role: "assistant",
          content: "",
          generatedImage: { dataUrl: "", isFinal: false },
        },
      ]);
      let assistantRowId: string | null = null;
      try {
        const inserted = await insertMessage({
          conversation_id: conversationId,
          role: "assistant",
          content: "",
        });
        assistantRowId = inserted.id;
      } catch {
        // best effort
      }
      try {
        await streamImage({
          prompt: text,
          onFrame: (dataUrl, isFinal) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantLocalId
                  ? { ...m, generatedImage: { dataUrl, isFinal } }
                  : m,
              ),
            );
            if (isFinal && assistantRowId) {
              updateAssistantMessage(assistantRowId, { generated_image: dataUrl }).catch(() => {});
              touchConversation(conversationId).catch(() => {});
              refreshConversations();
            }
          },
          onError: (msg) => {
            toast.error(msg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantLocalId
                  ? { ...m, content: `⚠️ ${msg}`, generatedImage: undefined }
                  : m,
              ),
            );
            if (assistantRowId) {
              updateAssistantMessage(assistantRowId, { content: `⚠️ ${msg}` }).catch(() => {});
            }
          },
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Chat mode
    const history = [...messages, userMsg].map((m) => {
      if (m.role === "user" && m.images && m.images.length) {
        return {
          role: "user" as const,
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const assistantLocalId = uid();
    setMessages((prev) => [...prev, { id: assistantLocalId, role: "assistant", content: "" }]);

    let assistantRowId: string | null = null;
    try {
      const inserted = await insertMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: "",
      });
      assistantRowId = inserted.id;
    } catch {
      // ignore
    }

    let acc = "";
    try {
      await streamChat({
        messages: history,
        onDelta: (chunk) => {
          acc += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantLocalId ? { ...m, content: acc } : m)),
          );
        },
        onDone: () => {
          if (assistantRowId) {
            updateAssistantMessage(assistantRowId, { content: acc }).catch(() => {});
          }
          touchConversation(conversationId).catch(() => {});
          refreshConversations();
        },
        onError: (msg) => {
          toast.error(msg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantLocalId ? { ...m, content: `⚠️ ${msg}` } : m,
            ),
          );
          if (assistantRowId) {
            updateAssistantMessage(assistantRowId, { content: `⚠️ ${msg}` }).catch(() => {});
          }
        },
      });
    } finally {
      setIsLoading(false);
    }

    // Rename conversation to first user message if still default
    const current = conversations.find((c) => c.id === conversationId);
    if (current && current.title === "Nova conversa" && text) {
      renameConversation(conversationId, text).catch(() => {});
    }
  };

  const refreshConversations = () => {
    listConversations().then(setConversations).catch(() => {});
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <AuroraBackground />
      <Toaster />

      {/* Floating top controls */}
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-xl"
          aria-label="Abrir histórico"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          onClick={newChat}
          className="pointer-events-auto glass flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm"
          aria-label="Nova conversa"
        >
          <Plus className="h-4 w-4" />
          Novo
        </button>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 flex">
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="glass-strong relative ml-0 flex h-full w-[85vw] max-w-xs flex-col border-r border-border/60 p-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg shadow-glow"
                  style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }}
                >
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-semibold text-aurora">Atena</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={newChat}
              className="mb-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow"
              style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }}
            >
              <Plus className="h-4 w-4" />
              Nova conversa
            </button>

            <div className="flex-1 overflow-y-auto">
              <p className="mb-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Histórico
              </p>
              {conversations.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {conversations.map((c) => (
                    <li key={c.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => openConversation(c.id)}
                        className={`flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition ${
                          activeId === c.id
                            ? "glass text-foreground"
                            : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                        }`}
                      >
                        {c.title}
                      </button>
                      <button
                        onClick={() => removeConversation(c.id)}
                        className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="mb-2 truncate px-1 text-xs text-muted-foreground">{userEmail}</p>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Messages */}
      <main
        ref={scrollRef}
        className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-3 pb-4 pt-[calc(max(env(safe-area-inset-top),0.75rem)+3rem)] sm:px-4"
      >
        {messages.length === 0 ? (
          <Welcome onSend={(p) => send(p)} />
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Atena está pensando…</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Composer */}
      <div className="sticky bottom-0 z-10 border-t border-border/60 glass">
        <div className="mx-auto w-full max-w-4xl px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <ModeButton
              active={mode === "chat"}
              onClick={() => setMode("chat")}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Chat"
            />
            <ModeButton
              active={mode === "image"}
              onClick={() => setMode("image")}
              icon={<Wand2 className="h-3.5 w-3.5" />}
              label="Gerar Imagem"
            />
          </div>

          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((src, i) => (
                <div key={i} className="relative">
                  <img
                    src={src}
                    alt="anexo"
                    className="h-16 w-16 rounded-lg border border-border object-cover"
                  />
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                    aria-label="Remover anexo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl glass-strong p-2">
            {mode === "chat" && (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:text-foreground hover:bg-muted/40"
                aria-label="Anexar imagem"
                disabled={isLoading}
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                handleAttach(e.target.files);
                e.target.value = "";
              }}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                mode === "image"
                  ? "Descreva a imagem que Atena deve criar…"
                  : "Pergunte algo a Atena…"
              }
              className="flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              disabled={isLoading}
            />
            <button
              onClick={() => send()}
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-glow transition disabled:opacity-40 disabled:shadow-none hover:brightness-110"
              style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }}
              aria-label="Enviar"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2.5 text-center text-xs text-foreground/60">
            Atena pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-transparent text-primary-foreground shadow-glow"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
      style={
        active
          ? { background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}

function Welcome({ onSend }: { onSend: (p: string) => void }) {
  const suggestions = [
    { short: "Computação quântica", full: "Explique computação quântica como se eu tivesse 12 anos" },
    { short: "Plano de Python em 30 dias", full: "Crie um plano de estudos de 30 dias para aprender Python" },
    { short: "E-mail de proposta comercial", full: "Escreva um e-mail formal de proposta comercial" },
    { short: "Resumo do século XX", full: "Resuma os principais eventos do século XX" },
  ];
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center sm:py-10">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-glow sm:mb-5 sm:h-16 sm:w-16"
        style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }}
      >
        <Sparkles className="h-7 w-7 text-primary-foreground sm:h-8 sm:w-8" />
      </div>
      <h2 className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Olá, sou a <span className="text-aurora">Atena</span>
      </h2>
      <p className="mb-6 max-w-md text-sm text-muted-foreground sm:mb-8">
        Sua IA multimodal — converse, envie imagens para análise ou gere arte digital com um clique.
      </p>

      <div className="-mx-3 w-screen max-w-[100vw] overflow-x-auto px-3 pb-1 sm:hidden">
        <div className="flex w-max gap-2">
          {suggestions.map((s) => (
            <button
              key={s.full}
              onClick={() => onSend(s.full)}
              className="glass shrink-0 rounded-full px-4 py-2 text-xs font-medium text-foreground transition active:scale-95"
            >
              {s.short}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden w-full max-w-2xl grid-cols-2 gap-2 sm:grid">
        {suggestions.map((s) => (
          <button
            key={s.full}
            onClick={() => onSend(s.full)}
            className="glass rounded-xl px-4 py-3 text-left text-sm text-foreground transition hover:border-primary/40 hover:shadow-glow"
          >
            {s.full}
          </button>
        ))}
      </div>
    </div>
  );
}
