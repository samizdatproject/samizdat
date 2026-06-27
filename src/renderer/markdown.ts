// Minimal Markdown → HTML converter for SAMIZDAT.
// No dependencies, no CDN. Handles common Markdown subset.
// Output must always be passed through sanitizeHtml before display.

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

export function markdownToHtml(md: string): string {
  const text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract fenced code blocks before other transformations
  const codeBlocks: string[] = [];
  const withPlaceholders = text.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, content) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escHtml(content.replace(/\n$/, ''))}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  const lines = withPlaceholders.split('\n');
  const blocks: string[] = [];
  const listItems: string[] = [];
  let listType = 'ul';
  let inList = false;

  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push(`<${listType}>\n${listItems.join('\n')}\n</${listType}>`);
      listItems.length = 0;
      inList = false;
    }
  };

  for (const line of lines) {
    if (/^\x00CODE\d+\x00$/.test(line.trim())) {
      flushList();
      blocks.push(line.trim());
      continue;
    }
    const hMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      flushList();
      const n = hMatch[1]!.length;
      blocks.push(`<h${n}>${inlineMarkdown(hMatch[2]!)}</h${n}>`);
      continue;
    }
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList();
      blocks.push('<hr>');
      continue;
    }
    const bqMatch = line.match(/^>\s*(.*)/);
    if (bqMatch) {
      flushList();
      blocks.push(`<blockquote><p>${inlineMarkdown(bqMatch[1]!)}</p></blockquote>`);
      continue;
    }
    const ulMatch = line.match(/^[-*+]\s+(.*)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') { flushList(); inList = true; listType = 'ul'; }
      listItems.push(`<li>${inlineMarkdown(ulMatch[1]!)}</li>`);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') { flushList(); inList = true; listType = 'ol'; }
      listItems.push(`<li>${inlineMarkdown(olMatch[1]!)}</li>`);
      continue;
    }
    if (line.trim() === '') {
      flushList();
      blocks.push('\x00BLANK\x00');
      continue;
    }
    flushList();
    blocks.push(inlineMarkdown(line));
  }
  flushList();

  // Group plain text lines into paragraphs
  const result: string[] = [];
  const paraLines: string[] = [];

  const flushPara = (): void => {
    if (paraLines.length > 0) {
      result.push(`<p>${paraLines.join('<br>')}</p>`);
      paraLines.length = 0;
    }
  };

  for (const block of blocks) {
    if (block === '\x00BLANK\x00') {
      flushPara();
    } else if (block.startsWith('<') || /^\x00CODE\d+\x00$/.test(block)) {
      flushPara();
      result.push(block);
    } else {
      paraLines.push(block);
    }
  }
  flushPara();

  let html = result.join('\n');
  codeBlocks.forEach((cb, idx) => {
    html = html.replace(`\x00CODE${idx}\x00`, cb);
  });

  return html;
}
