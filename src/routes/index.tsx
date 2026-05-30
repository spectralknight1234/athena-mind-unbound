import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AuroraBackground } from "@/components/atena/AuroraBackground";
import { Message, type AtenaMessage } from "@/components/atena/Message";
import { streamChat, streamImage } from "@/lib/atena-stream";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atena — IA Multimodal" },
      {
        name: "description",
        content:
          "Atena é uma IA multimodal: converse, analise imagens e gere arte digital em português.",
      },
      { property: "og:title", content: "Atena — IA Multimodal" },
      {
        property: "og:description",
        content:
          "Converse, analise imagens e gere arte digital com Atena, sua assistente de IA.",
      },
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
  const [messages, setMessages] = useState<AtenaMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

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

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text && attachments.length === 0) return;
    if (isLoading) return;

    const userMsg: AtenaMessage = {
      id: uid(),
      role: "user",
      content: text,
      images: attachments.length ? attachments : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    if (mode === "image") {
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          generatedImage: { dataUrl: "", isFinal: false },
        },
      ]);
      try {
        await streamImage({
          prompt: text,
          onFrame: (dataUrl, isFinal) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, generatedImage: { dataUrl, isFinal } }
                  : m,
              ),
            );
          },
          onError: (msg) => {
            toast.error(msg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `⚠️ ${msg}`, generatedImage: undefined }
                  : m,
              ),
            );
          },
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Chat mode — build OpenAI-compatible messages with optional images
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

    const assistantId = uid();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    let acc = "";
    try {
      await streamChat({
        messages: history,
        onDelta: (chunk) => {
          acc += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        },
        onDone: () => {},
        onError: (msg) => {
          toast.error(msg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m,
            ),
          );
        },
      });
    } finally {
      setIsLoading(false);
    }
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

      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-border/60">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shadow-glow"
            style={{
              background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
            }}
          >
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">
              <span className="text-aurora">Atena</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              IA multimodal • chat, visão e geração de imagens
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main
        ref={scrollRef}
        className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-6"
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
          {/* Mode toggle */}
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

          {/* Attachments preview */}
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
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
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
              disabled={
                isLoading ||
                (!input.trim() && attachments.length === 0)
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-glow transition disabled:opacity-40 disabled:shadow-none hover:brightness-110"
              style={{
                background:
                  "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
              }}
              aria-label="Enviar"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
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
          ? {
              background:
                "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
            }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}

function Welcome({ onPick }: { onPick: (p: string) => void }) {
  const suggestions = [
    "Explique computação quântica como se eu tivesse 12 anos",
    "Crie um plano de estudos de 30 dias para aprender Python",
    "Escreva um e-mail formal de proposta comercial",
    "Resuma os principais eventos do século XX",
  ];
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl shadow-glow"
        style={{
          background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
        }}
      >
        <Sparkles className="h-8 w-8 text-primary-foreground" />
      </div>
      <h2 className="mb-2 text-3xl font-semibold tracking-tight">
        Olá, sou a <span className="text-aurora">Atena</span>
      </h2>
      <p className="mb-8 max-w-md text-sm text-muted-foreground">
        Sua IA multimodal — converse, envie imagens para análise ou gere arte
        digital com um clique.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="glass rounded-xl px-4 py-3 text-left text-sm text-foreground transition hover:border-primary/40 hover:shadow-glow"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
