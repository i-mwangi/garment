import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> :
    part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-app-background px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code> : part,
  );
}

function cells(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(cell => cell.trim());
}

function separator(line: string): boolean {
  return cells(line).every(cell => /^:?-{3,}:?$/.test(cell));
}

export default function AgentAnswer({ text, suppressRepeated }: { text: string; suppressRepeated?: string }) {
  const cleaned = suppressRepeated ? text.replaceAll(suppressRepeated, "").trim() : text.trim();
  const lines = cleaned.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }
    if (line.includes("|") && index + 1 < lines.length && separator(lines[index + 1]) && cells(line).length === cells(lines[index + 1]).length) {
      const headers = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && cells(lines[index]).length === headers.length) rows.push(cells(lines[index++]));
      blocks.push(<div key={blocks.length} className="overflow-x-auto rounded-xl border border-primary-divider"><table className="w-full min-w-[300px] border-collapse text-left text-[13px]"><thead className="bg-app-background"><tr>{headers.map((header, cell) => <th key={cell} scope="col" className="border-b border-primary-divider px-3 py-2 font-semibold">{inline(header)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-primary-divider last:border-b-0">{row.map((value, cell) => <td key={cell} className="px-3 py-2 align-top break-words">{inline(value)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) { blocks.push(<h3 key={blocks.length} className="font-semibold">{inline(line.replace(/^#{1,3}\s+/, ""))}</h3>); index++; continue; }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && (ordered ? /^\d+\.\s+/.test(lines[index].trim()) : /^[-*]\s+/.test(lines[index].trim()))) items.push(lines[index++].trim().replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""));
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>);
      blocks.push(ordered ? <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{children}</ol> : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{children}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^([-*]\s+|\d+\.\s+|#{1,3}\s+)/.test(lines[index].trim()) && !(index + 1 < lines.length && lines[index].includes("|") && separator(lines[index + 1]))) paragraph.push(lines[index++].trim());
    blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="space-y-3 text-[14px] leading-6 break-words">{blocks}</div>;
}
