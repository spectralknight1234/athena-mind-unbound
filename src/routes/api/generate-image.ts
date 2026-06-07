import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response("GEMINI_API_KEY não configurada", { status: 500 });
        }

        const { prompt } = (await request.json()) as { prompt: string };
        if (!prompt || typeof prompt !== "string") {
          return new Response("Prompt obrigatório", { status: 400 });
        }

        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ["IMAGE"] },
            }),
            signal: request.signal,
          },
        );

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          console.error("Gemini image error:", upstream.status, text);
          return new Response(text || "Falha na geração de imagem", {
            status: upstream.status,
          });
        }

        const json = (await upstream.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> };
          }>;
        };

        const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        const b64 = part?.inlineData?.data;
        if (!b64) {
          return new Response("Imagem não retornada pelo Gemini", { status: 500 });
        }

        const encoder = new TextEncoder();
        const sse =
          `event: image_generation.completed\n` +
          `data: ${JSON.stringify({ b64_json: b64 })}\n\n`;

        return new Response(encoder.encode(sse), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
