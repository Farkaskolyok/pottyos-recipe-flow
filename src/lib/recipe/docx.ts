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
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: [new TextRun({ text: b.text, bold: true, font: FONT, size: 24, color: RED })],
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
        properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
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
                children: [new TextRun({ text: "Készült: PÖTTYÖS RecipeFlow – helyi feldolgozás", font: FONT, size: 16, color: "888888" })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: d.title.toUpperCase(), bold: true, font: FONT, size: 32 })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: d.meta.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, shade: true, width: 35 }), cell(v, { width: 65 })] })),
          }),
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
