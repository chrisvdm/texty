import React from "react";

const renderInline = (text: string) => {
  const nodes: React.ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      nodes.push(
        <code key={`${match.index}-code`} className="docs-inline-code">
          {match[1]}
        </code>,
      );
    } else if (match[2] && match[3]) {
      nodes.push(
        <a key={`${match.index}-link`} href={match[3]} className="docs-link">
          {match[2]}
        </a>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

export const renderMarkdown = (source: string) => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  const isListItem = (line: string) => /^- /.test(line.trim());
  const isOrderedItem = (line: string) => /^\d+\. /.test(line.trim());

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const codeMatch = rawLine.match(/^```([a-z0-9_-]+)?$/i);
    if (codeMatch) {
      const language = codeMatch[1] || "";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre key={`code-${blocks.length}`} className="docs-code-block">
          <code data-language={language}>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const key = `heading-${blocks.length}`;

      if (level === 1) {
        blocks.push(
          <h1 key={key} className="docs-heading-1">
            {renderInline(text)}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={key} className="docs-heading-2">
            {renderInline(text)}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={key} className="docs-heading-3">
            {renderInline(text)}
          </h3>,
        );
      }

      index += 1;
      continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];
      while (index < lines.length && isListItem(lines[index])) {
        items.push(lines[index].trim().replace(/^- /, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`list-${blocks.length}`} className="docs-list">
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (isOrderedItem(line)) {
      const items: string[] = [];
      while (index < lines.length && isOrderedItem(lines[index])) {
        items.push(lines[index].trim().replace(/^\d+\. /, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`olist-${blocks.length}`} className="docs-list">
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("```") &&
      !lines[index].trim().match(/^(#{1,3})\s+/) &&
      !isListItem(lines[index]) &&
      !isOrderedItem(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`} className="docs-paragraph">
        {renderInline(paragraphLines.join(" "))}
      </p>,
    );
  }

  return blocks;
};
