import { createFileRoute } from "@tanstack/react-router";

// Receives ONLY a normalized regulation identifier (e.g. "1169/2011/EU") and asks the
// official EU Publications Office (EUR-Lex data) whether it exists. Nothing else is accepted.
const ID = /^(\d{1,4})\/(\d{1,4})\/(EU|EK|EGK)$/;
const SPARQL = "https://publications.europa.eu/webapi/rdf/sparql";

function candidates(a: string, b: string) {
  const out: string[] = [];
  const add = (year: string, num: string) => {
    if (year.length !== 4 || +year < 1952 || +year > 2100) return;
    for (const t of ["R", "L", "D"]) out.push(`3${year}${t}${num.padStart(4, "0")}`);
  };
  add(b, a);
  add(a, b);
  return [...new Set(out)];
}

export const Route = createFileRoute("/api/public/regulation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const m = ID.exec(id);
        const json = (o: unknown, status = 200) =>
          new Response(JSON.stringify(o), {
            status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        if (!m) return json({ kind: "invalid" }, 400);
        const c = candidates(m[1]!, m[2]!);
        if (!c.length) return json({ kind: "invalid" }, 400);
        const { localOnly } = await import("@/lib/network.server");
        if (localOnly()) return json({ kind: "offline" });
        const list = c.map((x) => `"${x}"^^<http://www.w3.org/2001/XMLSchema#string>`).join(",");
        const q = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT DISTINCT ?c WHERE { ?w cdm:resource_legal_id_celex ?c . FILTER(?c IN (${list})) } LIMIT 5`;
        try {
          const r = await fetch(
            `${SPARQL}?format=${encodeURIComponent("application/sparql-results+json")}&query=${encodeURIComponent(q)}`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!r.ok) return json({ kind: "offline" }, 502);
          const d = (await r.json()) as { results: { bindings: { c: { value: string } }[] } };
          const found = d.results.bindings.map((x) => x.c.value);
          const celex = c.find((x) => found.includes(x));
          const source = "EUR-Lex (Publications Office of the EU)";
          if (!celex) return json({ kind: "not_found", source });
          return json({
            kind: "found",
            celex,
            source,
            url: `https://eur-lex.europa.eu/legal-content/HU/TXT/?uri=CELEX:${celex}`,
          });
        } catch {
          return json({ kind: "offline" }, 502);
        }
      },
    },
  },
});
