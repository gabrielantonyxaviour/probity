// Mermaid erDiagram from zetaris/usl.ddl. Labelled generated, not a Zetaris screenshot.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Col = { name: string; type: string; pk: boolean; ref?: { table: string; column: string } };

function tables(ddl: string): { name: string; cols: Col[] }[] {
  const body = ddl.replace(/^[\s\S]*?\bDDL\s*/, "");
  const chunks = body.split(/\n(?=CREATE TABLE )/).filter((c) => c.startsWith("CREATE TABLE "));
  return chunks.map((chunk) => {
    const name = chunk.match(/^CREATE TABLE (\w+)/)?.[1] ?? "unknown";
    const inner = chunk.replace(/^CREATE TABLE \w+ \(\n/, "").replace(/\)\s*$/, "");
    const cols: Col[] = [];
    for (const line of inner.split("\n")) {
      const trimmed = line.trim().replace(/,$/, "");
      const match = trimmed.match(/^(\w+)\s+(\S+)(.*)$/);
      if (!match) continue;
      const ref = match[3]?.match(/REFERENCES\s+(\w+)\((\w+)\)/i);
      cols.push({
        name: match[1]!,
        type: match[2]!.replace(/\(.*$/, ""),
        pk: /PRIMARY KEY/i.test(match[3] ?? ""),
        ref: ref ? { table: ref[1]!, column: ref[2]! } : undefined,
      });
    }
    return { name, cols };
  });
}

function mermaid(ddl: string): string {
  const parsed = tables(ddl);
  const lines = ["erDiagram"];
  for (const table of parsed) {
    lines.push(`  ${table.name} {`);
    for (const col of table.cols) {
      const mark = col.pk ? " PK" : col.ref ? " FK" : "";
      lines.push(`    ${col.type} ${col.name}${mark}`);
    }
    lines.push("  }");
  }
  for (const table of parsed) {
    for (const col of table.cols) {
      if (!col.ref) continue;
      lines.push(`  ${col.ref.table} ||--o{ ${table.name} : ${col.name}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

const ddl = readFileSync("zetaris/usl.ddl", "utf8");
const out = "zetaris/results/vendor360-erd.md";
mkdirSync("zetaris/results", { recursive: true });
writeFileSync(out, `# vendor360\n\nGenerated from zetaris/usl.ddl. Not a Zetaris UI screenshot.\n\n\`\`\`mermaid\n${mermaid(ddl)}\`\`\`\n`);
process.stdout.write(`usl-erd ${out} tables=${tables(ddl).length}\n`);
