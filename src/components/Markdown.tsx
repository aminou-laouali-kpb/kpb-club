import { Fragment, type ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Rendu Markdown minimal (titres, listes, paragraphes) — aucune balise HTML brute. */
export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const text = paragraph.join(" ");
      blocks.push(
        <p key={`p-${blocks.length}`} className="leading-relaxed text-foreground/85">
          {inline(text, `p-${blocks.length}`)}
        </p>,
      );
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      const items = list.items.map((item, i) => (
        <li key={i} className="leading-relaxed text-foreground/85">
          {inline(item, `li-${blocks.length}-${i}`)}
        </li>
      ));
      blocks.push(
        list.ordered ? (
          <ol key={`l-${blocks.length}`} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={`l-${blocks.length}`} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const cls =
        level <= 2
          ? "font-display text-2xl font-semibold text-foreground mt-8"
          : "font-display text-lg font-semibold text-foreground mt-6";
      blocks.push(
        <p key={`h-${blocks.length}`} className={cls}>
          {inline(text, `h-${blocks.length}`)}
        </p>,
      );
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (ordered || bullet) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const item = (ordered ?? bullet)![1];
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(item);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();

  return <div className="space-y-4">{blocks}</div>;
}
