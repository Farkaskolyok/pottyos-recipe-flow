import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isLoopbackUrl } from "./network";

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
    const baseURL = process.env["AI_BASE_URL"];
    const model = process.env["AI_MODEL"];
    if (!baseURL || !model) return { ok: false, error: "Az AI szolgáltatás nincs implementálva" };
    const { localOnly, providerFetch } = await import("./network.server");
    if (localOnly() && !isLoopbackUrl(baseURL))
      return { ok: false, error: "Helyi módban csak helyi AI szolgáltatás használható." };
    if (!data.fields.length || !data.snippets.length) return { ok: true, results: [], noise: [] };
    const { generateObject } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const provider = createOpenAI({
      baseURL,
      apiKey: process.env["AI_API_KEY"] || "local",
      fetch: providerFetch,
    });
    const prompt = `HIÁNYZÓ MEZŐK:\n${data.fields.map((f) => `- ${f.key}: ${f.label}`).join("\n")}\n\nSZÖVEGRÉSZLETEK:\n${data.snippets.map((s) => `[${s.id}] ${s.text}`).join("\n")}`;
    try {
      const result = await generateObject({
        model: provider.chat(model),
        system: SYSTEM,
        prompt,
        schema: Out,
        providerOptions: { openai: { store: false } },
      });
      const out = Out.parse(result.object);
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
