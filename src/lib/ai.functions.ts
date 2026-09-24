import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fields: z.array(z.object({ key: z.string(), label: z.string() })).max(60),
  snippets: z.array(z.object({ id: z.string(), text: z.string().max(500) })).max(200),
});

const Out = z.object({
  results: z.array(
    z.object({
      fieldKey: z.string(),
      value: z.string().nullable(),
      snippetId: z.string().nullable(),
      confidence: z.number(),
    }),
  ),
  noise: z.array(z.string()),
});

export type AiAnalyzeResult =
  | { ok: true; results: z.infer<typeof Out>["results"]; noise: string[] }
  | { ok: false; error: string };

const SYSTEM = `Élelmiszeripari dokumentumelemző vagy. Beszállítói specifikációk rövid szövegrészleteit kapod azonosítóval, és egy listát a hiányzó céltermék-mezőkről.
Minden mezőhöz döntsd el: van-e MEGBÍZHATÓ forrásszöveg, amely kitölti. Ha igen: add vissza az értéket a forrásszöveg szavaival (rövidítve, átfogalmazás nélkül), a snippetId-t és a bizonyosságot (0–1). Ha nincs: value = "NOT_FOUND", snippetId = null, confidence = 0.
SZIGORÚ TILTÁSOK: ne találj ki adatot; ne számolj tápértéket; ne találj ki SAP/TARIC/vonalkód/jogszabályi értéket; csak olyan érték, ami szó szerint szerepel a részletben.
Az érzékszervi (állomány, szín, íz, szag) sorokat a sensory mezőbe, a folyamatparamétereket (pl. hőmérséklet) a processDescription mezőbe tedd.
A "noise" listába tedd azoknak a részleteknek az azonosítóját, amelyek nem üzleti adatok (telefonszám, e-mail, oldalszám, verzió, fejléc/lábléc, aláírás, XML-maradvány, értelmezhetetlen karaktersor, általános jogi magyarázat).`;

export const aiAnalyze = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AiAnalyzeResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "Az AI szolgáltatás nincs beállítva." };
    if (!data.fields.length || !data.snippets.length) return { ok: true, results: [], noise: [] };
    const { streamText, Output } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { createLovableAiGatewayRunIdFetch } = await import("./ai-gateway.server");
    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });
    const prompt = `HIÁNYZÓ MEZŐK:\n${data.fields.map((f) => `- ${f.key}: ${f.label}`).join("\n")}\n\nSZÖVEGRÉSZLETEK:\n${data.snippets.map((s) => `[${s.id}] ${s.text}`).join("\n")}`;
    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: SYSTEM,
        prompt,
        output: Output.object({ schema: Out }),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const out = await result.output;
      return { ok: true, results: out.results, noise: out.noise };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 402) return { ok: false, error: "Elfogyott az AI keret (kredit)." };
      if (status === 429) return { ok: false, error: "Túl sok kérés, próbáld újra később." };
      if (status === 403) return { ok: false, error: "Az AI használata nem engedélyezett." };
      console.error("aiAnalyze failed", msg);
      return { ok: false, error: "Az AI adatellenőrzés nem sikerült." };
    }
  });
