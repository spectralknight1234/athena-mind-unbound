import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";

type Msg = {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: Msg[];
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  signal?: AbortSignal;
}) {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({ error: "Falha ao iniciar stream" }));
    onError(err.error ?? "Falha ao iniciar stream");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let sawDone = false;

  try {
    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          sawDone = true;
          done = true;
          break;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          onError("A resposta foi interrompida por um erro no stream. Tente novamente.");
          return;
        }
      }
    }
  } catch {
    onError("A conexão com o Gemini foi interrompida. Tente novamente.");
    return;
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!sawDone) {
    onError("A resposta foi encerrada antes de terminar. Tente novamente.");
    return;
  }
  onDone();
}

export async function streamImage({
  prompt,
  onFrame,
  onError,
  signal,
}: {
  prompt: string;
  onFrame: (dataUrl: string, isFinal: boolean) => void;
  onError: (msg: string) => void;
  signal?: AbortSignal;
}) {
  const resp = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    onError(text || "Falha ao gerar imagem");
    return;
  }

  let sawCompleted = false;
  const parser = createParser({
    onEvent(event) {
      if (
        event.event !== "image_generation.partial_image" &&
        event.event !== "image_generation.completed"
      )
        return;
      try {
        const payload = JSON.parse(event.data) as { b64_json: string };
        const isFinal = event.event === "image_generation.completed";
        flushSync(() => {
          onFrame(`data:image/png;base64,${payload.b64_json}`, isFinal);
        });
        if (isFinal) sawCompleted = true;
      } catch {
        // ignore
      }
    },
  });

  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (!sawCompleted) onError("Stream encerrado sem imagem final");
}
