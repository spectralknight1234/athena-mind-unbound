import { createFileRoute } from "@tanstack/react-router";

function redact(input: string, apiKey?: string): string {
  let out = input;
  if (apiKey) out = out.split(apiKey).join("[REDACTED_KEY]");
  out = out.replace(/([?&]key=)[^&\s"']+/gi, "$1[REDACTED]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]");
  return out;
}

function newRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reqId = newRequestId();
        const t0 = Date.now();
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
          console.error(
            JSON.stringify({
              scope: "gemini.image",
              reqId,
              level: "error",
              event: "missing_api_key",
            }),
          );
          return new Response(
            JSON.stringify({
              error: "GEMINI_API_KEY não configurada na Vercel",
              reqId,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        let prompt: string;
        try {
          ({ prompt } = (await request.json()) as { prompt: string });
        } catch (err) {
          console.error(
            JSON.stringify({
              scope: "gemini.image",
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
        if (!prompt || typeof prompt !== "string") {
          return new Response(
            JSON.stringify({ error: "Prompt obrigatório", reqId }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        console.log(
          JSON.stringify({
            scope: "gemini.image",
            reqId,
            level: "info",
            event: "upstream_request",
            model: "gemini-2.5-flash-image",
            promptLen: prompt.length,
          }),
        );

        let upstream: Response;
        try {
          upstream = await fetch(
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
        } catch (err) {
          console.error(
            JSON.stringify({
              scope: "gemini.image",
              reqId,
              level: "error",
              event: "network_error",
              durationMs: Date.now() - t0,
              msg: redact(err instanceof Error ? err.message : String(err), apiKey),
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

        if (!upstream.ok) {
          const text = redact(await upstream.text().catch(() => ""), apiKey);
          console.error(
            JSON.stringify({
              scope: "gemini.image",
              reqId,
              level: "error",
              event: "upstream_error",
              status: upstream.status,
              durationMs: Date.now() - t0,
              body: text.slice(0, 1000),
            }),
          );
          let userMsg = "Falha na geração de imagem";
          if (upstream.status === 429) userMsg = "Limite de requisições atingido. Aguarde um momento.";
          else if (upstream.status === 401 || upstream.status === 403)
            userMsg = "GEMINI_API_KEY inválida ou sem permissão.";
          else if (upstream.status >= 500) userMsg = "Gemini indisponível no momento.";
          return new Response(
            JSON.stringify({ error: userMsg, reqId }),
            {
              status: upstream.status >= 500 ? 502 : upstream.status,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        let json: {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> };
          }>;
        };
        try {
          json = await upstream.json();
        } catch (err) {
          console.error(
            JSON.stringify({
              scope: "gemini.image",
              reqId,
              level: "error",
              event: "parse_error",
              msg: redact(err instanceof Error ? err.message : String(err), apiKey),
            }),
          );
          return new Response(
            JSON.stringify({ error: "Resposta inválida do Gemini", reqId }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        const b64 = part?.inlineData?.data;
        if (!b64) {
          console.error(
            JSON.stringify({
              scope: "gemini.image",
              reqId,
              level: "error",
              event: "no_image_returned",
              durationMs: Date.now() - t0,
            }),
          );
          return new Response(
            JSON.stringify({ error: "Imagem não retornada pelo Gemini", reqId }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        console.log(
          JSON.stringify({
            scope: "gemini.image",
            reqId,
            level: "info",
            event: "success",
            durationMs: Date.now() - t0,
            bytes: b64.length,
          }),
        );

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
