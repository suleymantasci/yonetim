import type { ReactNode } from "react";

/**
 * Minimal markdown render — başlık, paragraf, liste, tablo, kalın metin.
 * Harici bağımlılık kullanmadan blog içeriklerini render eder.
 */
export function renderMarkdown(markdown: string): ReactNode[] {
  const blocks = markdown.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const key = `b${i}`;
    const trimmed = block.trim();

    if (trimmed.startsWith("### ")) {
      return (
        <h3 key={key} className="mt-6 font-heading text-lg font-bold">
          {inline(trimmed.slice(4))}
        </h3>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h2 key={key} className="mt-8 font-heading text-2xl font-bold">
          {inline(trimmed.slice(3))}
        </h2>
      );
    }
    if (trimmed.startsWith("| ")) {
      return <MarkdownTable key={key} block={trimmed} />;
    }
    if (/^[-*] /m.test(trimmed) && trimmed.split("\n").every((l) => /^[-*] /.test(l.trim()))) {
      return (
        <ul key={key} className="mt-4 space-y-1.5 pl-5 text-fg-muted">
          {trimmed.split("\n").map((line, j) => (
            <li key={`${key}-${j}`} className="list-disc">
              {inline(line.replace(/^[-*] /, ""))}
            </li>
          ))}
        </ul>
      );
    }
    if (/^\d+\. /m.test(trimmed) && trimmed.split("\n").every((l) => /^\d+\. /.test(l.trim()))) {
      return (
        <ol key={key} className="mt-4 space-y-1.5 pl-5 text-fg-muted">
          {trimmed.split("\n").map((line, j) => (
            <li key={`${key}-${j}`} className="list-decimal">
              {inline(line.replace(/^\d+\. /, ""))}
            </li>
          ))}
        </ol>
      );
    }
    return (
      <p key={key} className="mt-4 leading-relaxed text-fg-muted">
        {inline(trimmed)}
      </p>
    );
  });
}

function MarkdownTable({ block }: { block: string }) {
  const lines = block.split("\n").filter((l) => l.trim().length > 0);
  const rows = lines
    .filter((l) => !/^\|[\s:-]+\|$/.test(l.replace(/\s/g, "")))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  const [header, ...body] = rows;
  if (!header) return null;

  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-surface-sunken text-left">
          <tr>
            {header.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={`r${i}`} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={`c${j}`} className="px-3 py-2">
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
