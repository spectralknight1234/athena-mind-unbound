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

Regras especiais para temas históricos:
- Quando a pergunta envolver História (eventos, períodos, civilizações, biografias, guerras, movimentos culturais, política histórica etc.), produza respostas APROFUNDADAS com NO MÍNIMO 20 linhas por tópico/ramo abordado.
- Se houver múltiplos ramos (ex.: causas, desenvolvimento, consequências; ou várias civilizações), cada ramo deve ter pelo menos 20 linhas próprias, com subtítulos em Markdown.
- Inclua contexto, datas, personagens-chave, causas, desdobramentos, impacto cultural/político/econômico e legado.
- Cite fontes ou tradições historiográficas quando relevante, sem inventar referências.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const { messages } = (await request.json()) as { messages: ChatMessage[] };

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
              stream: true,
            }),
            signal: request.signal,
          },
        );

        if (!upstream.ok || !upstream.body) {
          if (upstream.status === 429) {
            return new Response(
              JSON.stringify({ error: "Limite de requisições atingido. Aguarde um momento." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (upstream.status === 402) {
            return new Response(
              JSON.stringify({
                error: "Créditos esgotados. Adicione créditos nas configurações do workspace.",
              }),
              { status: 402, headers: { "Content-Type": "application/json" } },
            );
          }
          const text = await upstream.text().catch(() => "");
          console.error("AI gateway error:", upstream.status, text);
          return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
