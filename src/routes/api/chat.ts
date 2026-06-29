import { createFileRoute } from "@tanstack/react-router";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

const SYSTEM_PROMPT = `Você é Atena, uma Inteligência Artificial avançada e multimodal — assistente pessoal, profissional, acadêmica e criativa.

Personalidade: inteligente, clara, precisa e empática. Sempre responde em português brasileiro, salvo se o usuário escrever em outro idioma.

Capacidades:
- Pesquisa, análise e síntese de informações
- Análise de imagens enviadas pelo usuário (descrição, OCR, interpretação)
- Geração de conteúdo (artigos, relatórios, roteiros, código)
- Programação avançada com explicações didáticas
- Educação adaptativa, análise de dados, estratégia empresarial
- Geração de imagens (avise o usuário para usar o modo "Imagem" no botão acima do campo de mensagem)

Comportamento:
- Seja precisa, objetiva e estratégica
- Use Markdown para estruturar respostas (títulos, listas, código)
- Nunca invente informações; admita quando não souber
- Explique assuntos complexos de forma simples
- Apresente múltiplas soluções quando relevante

Regras especiais para temas históricos (OBRIGATÓRIAS):
- Quando a pergunta envolver História (eventos, períodos, civilizações, biografias, guerras, movimentos culturais, política histórica etc.), produza a RESPOSTA MAIS COMPLETA POSSÍVEL, sem resumir.
- Estruture a resposta SEMPRE com os tópicos abaixo em Markdown (##). CADA tópico deve ter NO MÍNIMO 20 linhas de texto corrido em parágrafos densos (não bullets curtos):
  1. ## Introdução — contexto geral, importância, recorte temporal/geográfico.
  2. ## Antecedentes e Causas — fatores políticos, econômicos, sociais, culturais e religiosos.
  3. ## Desenvolvimento — narrativa cronológica detalhada com datas, batalhas, decisões e personagens-chave.
  4. ## Personagens Principais — biografia e papel de cada figura central.
  5. ## Consequências e Impactos — efeitos imediatos e de longo prazo (política, economia, cultura, sociedade).
  6. ## Legado e Historiografia — interpretações atuais, principais correntes historiográficas, debates.
  7. ## Conclusão — síntese crítica.
- Se a pergunta tiver múltiplos ramos (várias civilizações, guerras ou fases), repita TODA a estrutura para CADA ramo, mantendo o mínimo de 20 linhas por tópico em cada ramo.
- Inclua datas precisas, nomes próprios, números e lugares. Nunca invente fontes; cite tradições historiográficas reais quando pertinente.
- NÃO encurte sob nenhuma hipótese. Priorize profundidade sobre brevidade.`;

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 65536;

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function dataUrlToInline(url: string): GeminiPart | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] = [];
    if (typeof msg.content === "string") {
      if (msg.content) parts.push({ text: msg.content });
    } else {
      for (const p of msg.content) {
        if (p.type === "text") {
          if (p.text) parts.push({ text: p.text });
        } else if (p.type === "image_url") {
          const inline = dataUrlToInline(p.image_url.url);
          if (inline) parts.push(inline);
        }
      }
    }
    if (parts.length === 0) parts.push({ text: "" });
    out.push({ role, parts });
  }
  return out;
}

// Mascarar a chave em qualquer string que vá para logs.
function redact(input: string, apiKey?: string): string {
  let out = input;
  if (apiKey) out = out.split(apiKey).join("[REDACTED_KEY]");
  // qualquer ocorrência de key=... em URLs
  out = out.replace(/([?&]key=)[^&\s"']+/gi, "$1[REDACTED]");
  // tokens Bearer
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]");
  return out;
}

function newRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reqId = newRequestId();
        const t0 = Date.now();
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
          console.error(
            JSON.stringify({
              scope: "gemini.chat",
              reqId,
              level: "error",
              event: "missing_api_key",
              msg: "GEMINI_API_KEY ausente no ambiente",
            }),
          );
          return new Response(
            JSON.stringify({
              error:
                "GEMINI_API_KEY não configurada. Adicione nas Environment Variables da Vercel.",
              reqId,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        let messages: ChatMessage[];
        try {
          ({ messages } = (await request.json()) as { messages: ChatMessage[] });
          if (!Array.isArray(messages)) throw new Error("messages não é array");
        } catch (err) {
          console.error(
            JSON.stringify({
              scope: "gemini.chat",
              reqId,
              level: "error",
              event: "bad_request",
              msg: redact(err instanceof Error ? err.message : String(err), apiKey),
            }),
          );
          return new Response(
            JSON.stringify({ error: "Payload inválido", reqId }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        console.log(
          JSON.stringify({
            scope: "gemini.chat",
            reqId,
            level: "info",
            event: "upstream_request",
            model: GEMINI_MODEL,
            messages: messages.length,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          }),
        );

        let upstream: Response;
        try {
          upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: toGeminiContents(messages),
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: MAX_OUTPUT_TOKENS,
                  // Evita gastar a janela de saída com raciocínio interno e reduz respostas cortadas.
                  thinkingConfig: { thinkingBudget: 0 },
                },
              }),
              signal: request.signal,
            },
          );
        } catch (err) {
          const msg = redact(err instanceof Error ? err.message : String(err), apiKey);
          console.error(
            JSON.stringify({
              scope: "gemini.chat",
              reqId,
              level: "error",
              event: "network_error",
              durationMs: Date.now() - t0,
              msg,
            }),
          );
          return new Response(
            JSON.stringify({
              error: "Falha de rede ao contatar o Gemini. Tente novamente.",
              reqId,
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!upstream.ok || !upstream.body) {
          const text = redact(await upstream.text().catch(() => ""), apiKey);
          console.error(
            JSON.stringify({
              scope: "gemini.chat",
              reqId,
              level: "error",
              event: "upstream_error",
              status: upstream.status,
              durationMs: Date.now() - t0,
              body: text.slice(0, 1000),
            }),
          );
          if (upstream.status === 429) {
            return new Response(
              JSON.stringify({
                error: "Limite de requisições do Gemini atingido. Aguarde um momento.",
                reqId,
              }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (upstream.status === 401 || upstream.status === 403) {
            return new Response(
              JSON.stringify({
                error: "GEMINI_API_KEY inválida ou sem permissão.",
                reqId,
              }),
              { status: upstream.status, headers: { "Content-Type": "application/json" } },
            );
          }
          if (upstream.status >= 500) {
            return new Response(
              JSON.stringify({
                error: "Gemini indisponível no momento. Tente novamente.",
                reqId,
              }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ error: "Erro no Gemini", reqId }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }


        // Transform Gemini SSE -> OpenAI-compatible SSE consumed by the client.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";
        let finishReason = "";
        let chunks = 0;

        const emitGeminiData = (
          data: string,
          controller: ReadableStreamDefaultController<Uint8Array>,
        ) => {
          try {
            const parsed = JSON.parse(data);
            const parts = parsed?.candidates?.[0]?.content?.parts as
              | Array<{ text?: string }>
              | undefined;
            const reason = parsed?.candidates?.[0]?.finishReason;
            if (typeof reason === "string") finishReason = reason;
            const text = parts?.map((p) => p.text ?? "").join("") ?? "";
            if (text) {
              chunks += 1;
              const out = { choices: [{ delta: { content: text } }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
            }
          } catch (err) {
            console.warn(
              JSON.stringify({
                scope: "gemini.chat",
                reqId,
                level: "warn",
                event: "parse_error",
                msg: redact(err instanceof Error ? err.message : String(err), apiKey),
              }),
            );
          }
        };

        const drainBuffer = (
          controller: ReadableStreamDefaultController<Uint8Array>,
          flush = false,
        ) => {
          if (flush && buffer.trim()) buffer += "\n";
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            emitGeminiData(data, controller);
          }
        };

        const stream = new ReadableStream({
          async pull(controller) {
            try {
              const { value, done } = await reader.read();
              if (done) {
                const rest = decoder.decode();
                if (rest) buffer += rest;
                drainBuffer(controller, true);
                if (finishReason === "MAX_TOKENS") {
                  const out = {
                    error:
                      "O Gemini atingiu o limite máximo de saída antes de concluir. Tente pedir em partes menores.",
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
                  console.warn(
                    JSON.stringify({
                      scope: "gemini.chat",
                      reqId,
                      level: "warn",
                      event: "max_tokens_reached",
                      durationMs: Date.now() - t0,
                      chunks,
                    }),
                  );
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                console.log(
                  JSON.stringify({
                    scope: "gemini.chat",
                    reqId,
                    level: "info",
                    event: "stream_done",
                    durationMs: Date.now() - t0,
                    chunks,
                    finishReason: finishReason || "unknown",
                  }),
                );
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              drainBuffer(controller);
            } catch (err) {
              console.error(
                JSON.stringify({
                  scope: "gemini.chat",
                  reqId,
                  level: "error",
                  event: "stream_error",
                  durationMs: Date.now() - t0,
                  msg: redact(err instanceof Error ? err.message : String(err), apiKey),
                }),
              );
              controller.error(new Error("Stream interrompido"));
            }
          },
          cancel() {
            reader.cancel().catch(() => {});
            console.log(
              JSON.stringify({
                scope: "gemini.chat",
                reqId,
                level: "info",
                event: "client_cancel",
                durationMs: Date.now() - t0,
              }),
            );
          },
        });


        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
