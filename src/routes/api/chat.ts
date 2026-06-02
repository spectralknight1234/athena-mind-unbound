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
