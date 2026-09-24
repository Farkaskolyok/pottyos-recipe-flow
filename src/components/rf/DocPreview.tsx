import type { DocModel, KVRow } from "@/lib/recipe/documents";
import { InlineField } from "./InlineField";

export function DocPreview({ doc }: { doc: DocModel }) {
  return (
    <div className="mx-auto max-w-[800px] rounded-lg border bg-paper p-6 font-[Arial,sans-serif] text-[13px] leading-relaxed shadow-[var(--shadow-soft)] sm:p-10">
      <div className="mb-5 flex items-baseline gap-3 border-b-2 border-primary pb-2">
        <span className="font-extrabold text-primary">PÖTTYÖS</span>
        <span className="text-muted-foreground">{doc.title}</span>
      </div>
      <h2 className="mb-3 text-xl font-bold uppercase">{doc.title}</h2>
      <KV rows={doc.meta} />
      {doc.blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className="mb-2 mt-6 text-[15px] font-bold text-primary">
                {b.text}
              </h3>
            );
          case "para":
            return (
              <div key={i} className="mb-2">
                {b.field ? (
                  <InlineField fieldKey={b.field} block={b.text.length > 60}>
                    <span>
                      {b.prefix}
                      {b.text || "—"}
                    </span>
                  </InlineField>
                ) : (
                  b.text
                )}
              </div>
            );
          case "rich": {
            const body = (
              <p>
                {[...(b.prefix ?? []), ...b.segments, ...(b.suffix ?? [])].map((s, j) => (s.emph ? <b key={j}>{s.text}</b> : <span key={j}>{s.text}</span>))}
              </p>
            );
            return (
              <div key={i} className="mb-2">
                {b.field ? (
                  <InlineField fieldKey={b.field} block>
                    {body}
                  </InlineField>
                ) : (
                  body
                )}
              </div>
            );
          }
          case "kv":
            return <KV key={i} rows={b.rows} />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {b.head.map((h) => (
                        <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} className="border px-2 py-1.5">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
      <p className="mt-10 text-center text-[11px] text-muted-foreground">Készült: PÖTTYÖS RecipeFlow – helyi feldolgozás</p>
    </div>
  );
}

function KV({ rows }: { rows: KVRow[] }) {
  if (!rows.length) return null;
  return (
    <table className="mb-2 w-full border-collapse">
      <tbody>
        {rows.map(([k, v, f]) => (
          <tr key={k}>
            <td className="w-[35%] border bg-muted px-2 py-1.5 align-top font-semibold">{k}</td>
            <td className="border px-2 py-1.5">{f ? <InlineField fieldKey={f} /> : v || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
