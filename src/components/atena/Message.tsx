import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, User as UserIcon } from "lucide-react";

export type AtenaMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs for user-uploaded images
  generatedImage?: { dataUrl: string; isFinal: boolean }; // for assistant image gen
};

export function Message({ message }: { message: AtenaMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full glass shadow-glow"
          style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }}
        >
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      )}

      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "glass-strong rounded-tr-sm"
            : "glass rounded-tl-sm"
        }`}
      >
        {message.images && message.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt="anexo"
                className="max-h-48 rounded-lg border border-border"
              />
            ))}
          </div>
        )}

        {message.generatedImage && (
          <img
            src={message.generatedImage.dataUrl}
            alt="imagem gerada"
            className={`mb-2 max-h-96 w-full rounded-lg border border-border transition-[filter] duration-500 ${
              message.generatedImage.isFinal ? "blur-0" : "blur-2xl"
            }`}
          />
        )}

        {message.content && (
          <div className="prose-atena">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full glass">
          <UserIcon className="h-4 w-4 text-foreground" />
        </div>
      )}
    </div>
  );
}
