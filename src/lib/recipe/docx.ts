import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
  PageNumber,
} from "docx";
import type { Block, DocModel } from "./documents";

const RED = "D6001C";
const FONT = "Arial";

function cell(text: string, opts: { bold?: boolean; shade?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: "F3F3F3" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, font: FONT, size: 20 })] })],
  });
}

function blockToDocx(b: Block): (Paragraph | Table)[] {
  switch (b.type) {
    case "heading":
      return [
        new Paragraph({
          heading: b.level === 2 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: [new TextRun({ text: b.text, bold: true, font: FONT, size: b.level === 2 ? 21 : 24, color: b.level === 2 ? "000000" : RED })],
        }),
      ];
    case "title":
      return b.lines.filter(Boolean).map(
        (t, i) =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: i === 0 ? 600 : 120, after: i === b.lines.length - 1 ? 480 : 120 },
            children: [new TextRun({ text: t, bold: i < 2, font: FONT, size: i === 0 ? 40 : i === 1 ? 30 : 22 })],
          }),
      );
    case "note":
      return [new Paragraph({ spacing: { before: 80, after: 120 }, children: [new TextRun({ text: b.text, italics: true, font: FONT, size: 17, color: "555555" })] })];
    case "side":
      return [
        new Paragraph({
          spacing: { before: 320, after: 120 },
          border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "999999", space: 4 } },
          children: [new TextRun({ text: b.text, bold: true, font: FONT, size: 20 })],
        }),
      ];
    case "sig":
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: b.cols.map((c) => new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: c.role, bold: true, font: FONT, size: 18 })] }), new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: c.name || " ", font: FONT, size: 20 })] })] })) }),
            new TableRow({ height: { value: 700, rule: "atLeast" }, children: b.cols.map(() => cell("Aláírás:", { width: 33 })) }),
          ],
        }),
      ];
    case "rev":
      return [
        new Paragraph({ spacing: { before: 280, after: 80 }, children: [new TextRun({ text: "Az előző verzióhoz képest változtatott részek:", bold: true, font: FONT, size: 20 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: ["Verzió szám", "Változás dátuma", "Változás, módosítás leírása"].map((h, i) => cell(h, { bold: true, shade: true, width: i === 2 ? 50 : 25 })) }),
            ...(b.rows.length ? b.rows : [["", "", ""]]).map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: i === 2 ? 50 : 25 })) })),
          ],
        }),
      ];
    case "para":
      if (!b.text) return [];
      return [new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: (b.prefix ?? "") + b.text, font: FONT, size: 20 })] })];
    case "rich":
      return [
        new Paragraph({
          spacing: { after: 100 },
          children: [...(b.prefix ?? []), ...b.segments, ...(b.suffix ?? [])].map((s) => new TextRun({ text: s.text, bold: s.emph, font: FONT, size: 20 })),
        }),
      ];
    case "kv":
      if (!b.rows.length) return [];
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.filter((r) => r[1]).map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, shade: true, width: 35 }), cell(v, { width: 65 })] })),
        }),
      ];
    case "table":
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.head.map((h) => cell(h, { bold: true, shade: true })) }),
            ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
          ],
        }),
      ];
  }
}

export function docModelToDocument(d: DocModel): Document {
  return new Document({
    creator: "PÖTTYÖS RecipeFlow",
    title: d.title,
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RED, space: 4 } },
                children: [
                  new TextRun({ text: "PÖTTYÖS", bold: true, font: FONT, size: 22, color: RED }),
                  new TextRun({ text: `   ${d.title}`, font: FONT, size: 20 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${d.meta.map((m) => m[1]).join(" · ")}   |   `, font: FONT, size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "888888" }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...(d.kind === "sheet" ? [] : [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: d.title.toUpperCase(), bold: true, font: FONT, size: 32 })] })]),
          ...d.blocks.flatMap(blockToDocx),
        ],
      },
    ],
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDocx(d: DocModel) {
  download(await Packer.toBlob(docModelToDocument(d)), d.fileName);
}

export async function exportAll(docs: DocModel[]) {
  for (const d of docs) {
    await exportDocx(d);
    await new Promise((r) => setTimeout(r, 300));
  }
}
