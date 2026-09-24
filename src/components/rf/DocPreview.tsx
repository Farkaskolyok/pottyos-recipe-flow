import type { DocModel, KVRow } from "@/lib/recipe/documents";
import { InlineField } from "./InlineField";

export function DocPreview({ doc }: { doc: DocModel }) {
  return (
    <div className="mx-auto max-w-[800px] rounded-lg border bg-paper p-6 font-[Arial,sans-serif] text-[13px] leading-relaxed shadow-[var(--shadow-soft)] sm:p-10">
      <div className="mb-5 flex items-baseline gap-3 border-b-2 border-primary pb-2">
        <span className="font-extrabold text-primary">PÖTTYÖS</span>
        <span className="text-muted-foreground">{doc.title}</span>
      </div>
      {doc.kind !== "sheet" && <h2 className="mb-3 text-xl font-bold uppercase">{doc.title}</h2>}
      {doc.blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className={b.level === 2 ? "mb-2 mt-4 text-[13px] font-bold" : "mb-2 mt-6 text-[15px] font-bold text-primary"}>
                {b.text}
              </h3>
            );
          case "title":
            return (
              <div key={i} className="my-8 text-center">
                {b.lines.filter(Boolean).map((t, j) => (
                  <p key={j} className={j === 0 ? "text-2xl font-extrabold" : j === 1 ? "mt-2 text-lg font-bold" : "mt-1"}>{t}</p>
                ))}
              </div>
            );
          case "note":
            return <p key={i} className="my-2 text-[11px] italic text-muted-foreground">{b.text}</p>;
          case "side":
            return <p key={i} className="mb-2 mt-8 border-b border-dashed pb-1 font-bold">{b.text}</p>;
          case "sig":
            return (
              <table key={i} className="mb-3 w-full border-collapse">
                <tbody>
                  <tr>
                    {b.cols.map((c) => (
                      <td key={c.field} className="w-1/3 border px-2 py-1.5 align-top">
                        <div className="text-[11px] font-semibold">{c.role}</div>
                        <div className="mt-1"><InlineField fieldKey={c.field} /></div>
                      </td>
                    ))}
                  </tr>
                  <tr>{b.cols.map((c) => <td key={c.field} className="h-10 border px-2 align-top text-[11px] text-muted-foreground">Aláírás:</td>)}</tr>
                </tbody>
              </table>
            );
          case "rev":
            return (
              <div key={i} className="mt-6">
                <p className="mb-1 font-semibold">Az előző verzióhoz képest változtatott részek:</p>
                <table className="w-full border-collapse">
                  <thead><tr>{["Verzió szám", "Változás dátuma", "Változás, módosítás leírása"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="border px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
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
                  <>{b.prefix}{b.text}</>
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
      <p className="mt-10 text-center text-[11px] text-muted-foreground">{doc.meta.map((m) => m[1]).join(" · ")}</p>
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
