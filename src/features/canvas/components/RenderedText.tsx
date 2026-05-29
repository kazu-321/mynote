import type { CSSProperties } from "react";
import MarkdownIt from "markdown-it";
import katex from "katex";
import "katex/dist/katex.min.css";

const markdownIt = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
});

const mathPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

function renderKatex(source: string, displayMode: boolean) {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return `<code>${source.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code>`;
  }
}

function splitSegments(content: string) {
  const segments: Array<{ kind: "text"; value: string } | { kind: "math"; value: string; display: boolean }> = [];
  let lastIndex = 0;
  for (const match of content.matchAll(mathPattern)) {
    const start = match.index ?? 0;
    const raw = match[0];
    if (start > lastIndex) segments.push({ kind: "text", value: content.slice(lastIndex, start) });
    if (raw.startsWith("$$")) {
      segments.push({ kind: "math", value: raw.slice(2, -2).trim(), display: true });
    } else {
      segments.push({ kind: "math", value: raw.slice(1, -1).trim(), display: false });
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < content.length) segments.push({ kind: "text", value: content.slice(lastIndex) });
  return segments;
}

function renderMarkdown(content: string) {
  return { __html: markdownIt.render(content) };
}

export function RenderedText(props: { content: string; style?: CSSProperties }) {
  const segments = splitSegments(props.content);
  return (
    <div className="text-render markdown-tex" style={props.style}>
      {segments.map((segment, index) =>
        segment.kind === "math" ? (
          <span
            key={`${segment.kind}-${index}`}
            className={segment.display ? "tex-block" : "tex-inline"}
            dangerouslySetInnerHTML={{ __html: renderKatex(segment.value, segment.display) }}
          />
        ) : segment.value.trim() ? (
          <div key={`${segment.kind}-${index}`} dangerouslySetInnerHTML={renderMarkdown(segment.value)} />
        ) : null,
      )}
    </div>
  );
}
