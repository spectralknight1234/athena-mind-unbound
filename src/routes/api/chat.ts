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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({
              error:
                "GEMINI_API_KEY não configurada. Adicione nas Environment Variables da Vercel.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const { messages } = (await request.json()) as { messages: ChatMessage[] };

        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: toGeminiContents(messages),
              generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
            }),
            signal: request.signal,
          },
        );

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          console.error("Gemini error:", upstream.status, text);
          if (upstream.status === 429) {
            return new Response(
              JSON.stringify({ error: "Limite de requisições do Gemini atingido. Aguarde um momento." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (upstream.status === 401 || upstream.status === 403) {
            return new Response(
              JSON.stringify({ error: "GEMINI_API_KEY inválida ou sem permissão." }),
              { status: upstream.status, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ error: "Erro no Gemini" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Transform Gemini SSE -> OpenAI-compatible SSE consumed by the client.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";

        const stream = new ReadableStream({
          async pull(controller) {
            const { value, done } = await reader.read();
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (!data) continue;
              try {
                const parsed = JSON.parse(data);
                const parts = parsed?.candidates?.[0]?.content?.parts as
                  | Array<{ text?: string }>
                  | undefined;
                const text = parts?.map((p) => p.text ?? "").join("") ?? "";
                if (text) {
                  const out = { choices: [{ delta: { content: text } }] };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
                }
              } catch {
                // ignore parse errors
              }
            }
          },
          cancel() {
            reader.cancel().catch(() => {});
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
