import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

// ─── Markdown pipe-table → HTML ──────────────────────────────────────────────
function markdownTableToHtml(tableLines) {
  // Drop pure separator rows (e.g. |---|---|)
  const rows = tableLines.filter(
    (line) => !/^\|?[\s\-|:]+\|?$/.test(line.trim())
  );
  if (rows.length === 0) return '';

  let html =
    '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85em">';
  rows.forEach((row, rowIndex) => {
    const cells = row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (rowIndex === 0) {
      html += '<thead><tr>';
      cells.forEach((c) => {
        html += `<th style="background:#0f172a;color:#fff;padding:6px 10px;text-align:left;white-space:nowrap">${c}</th>`;
      });
      html += '</tr></thead><tbody>';
    } else {
      const bg = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
      html += `<tr style="background:${bg}">`;
      cells.forEach((c) => {
        html += `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top">${c}</td>`;
      });
      html += '</tr>';
    }
  });
  html += '</tbody></table>';
  return html;
}

// Pre-process: convert markdown pipe-tables to <table> HTML so the segment
// parser picks them up as proper table blocks.
function convertMarkdownTables(text) {
  const lines = text.split('\n');
  const out = [];
  let buf = [];

  const isTableRow = (l) => {
    const t = l.trim();
    return t.startsWith('|') && t.lastIndexOf('|') > 0;
  };
  const isSep = (l) => /^\|?[\s\-|:]+\|?$/.test(l.trim()) && l.includes('-');

  const flush = () => {
    if (buf.length) {
      out.push(markdownTableToHtml(buf));
      buf = [];
    }
  };

  for (const line of lines) {
    if (isTableRow(line) || isSep(line)) {
      buf.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join('\n');
}

// ─── Segment parser ───────────────────────────────────────────────────────────
function parseSegments(rawText) {
  // First convert any markdown tables → <table> HTML
  const text = convertMarkdownTables(rawText);

  const parts = [];
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|<table[\s\S]*?<\/table>)/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('$$')) {
      parts.push({ type: 'block', content: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('$')) {
      parts.push({ type: 'inline', content: raw.slice(1, -1).trim() });
    } else {
      parts.push({ type: 'table', content: raw });
    }
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return parts;
}

// ─── Renderer ────────────────────────────────────────────────────────────────
export default function MathRenderer({ text, className = "" }) {
  if (!text) return null;

  const parts = parseSegments(text);
  if (parts.length === 0) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === 'table') {
          return (
            <div
              key={i}
              className="my-2 overflow-x-auto"
              style={{ fontSize: 'inherit' }}
              dangerouslySetInnerHTML={{ __html: part.content }}
            />
          );
        }
        if (part.type === 'block') {
          return (
            <div key={i} className="my-2">
              <BlockMath math={part.content} errorColor="#e53e3e" />
            </div>
          );
        }
        if (part.type === 'inline') {
          return <InlineMath key={i} math={part.content} errorColor="#e53e3e" />;
        }
        // Plain text — preserve newlines
        return (
          <span key={i}>
            {part.content.split('\n').map((line, j, arr) => (
              <React.Fragment key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </span>
        );
      })}
    </span>
  );
}
