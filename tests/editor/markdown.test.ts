import { describe, it, expect } from 'vitest';

// Import directly from the editor source — no build step needed for tests
// because Vitest resolves path aliases from the tsconfig.
// Note: editor/ has its own tsconfig so we reference the file directly.
import { markdownToHtml } from '../../editor/src/markdown';

describe('markdownToHtml', () => {
  it('renders h1', () => {
    expect(markdownToHtml('# Hello')).toContain('<h1>Hello</h1>');
  });

  it('renders h2 and h3', () => {
    const out = markdownToHtml('## Two\n### Three');
    expect(out).toContain('<h2>Two</h2>');
    expect(out).toContain('<h3>Three</h3>');
  });

  it('renders bold', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders italic', () => {
    expect(markdownToHtml('*italic*')).toContain('<em>italic</em>');
  });

  it('renders bold+italic', () => {
    expect(markdownToHtml('***both***')).toContain('<strong><em>both</em></strong>');
  });

  it('renders inline code with html escaping', () => {
    expect(markdownToHtml('`<div>`')).toContain('<code>&lt;div&gt;</code>');
  });

  it('renders a fenced code block with escaping', () => {
    const out = markdownToHtml('```\n<script>alert(1)</script>\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('renders an unordered list', () => {
    const out = markdownToHtml('- apple\n- banana');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>apple</li>');
    expect(out).toContain('<li>banana</li>');
  });

  it('renders an ordered list', () => {
    const out = markdownToHtml('1. first\n2. second');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>first</li>');
  });

  it('renders a blockquote', () => {
    expect(markdownToHtml('> wisdom')).toContain('<blockquote>');
  });

  it('renders a horizontal rule', () => {
    expect(markdownToHtml('---')).toContain('<hr>');
  });

  it('wraps plain text in a paragraph', () => {
    expect(markdownToHtml('hello world')).toContain('<p>');
    expect(markdownToHtml('hello world')).toContain('hello world');
  });

  it('renders a link', () => {
    expect(markdownToHtml('[SAMIZDAT](https://example.com)')).toContain('<a href="https://example.com">SAMIZDAT</a>');
  });

  it('handles empty string', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('does not produce raw script tags from fenced block', () => {
    const out = markdownToHtml('```js\nconsole.log("hi")\n```');
    expect(out).not.toMatch(/<script/i);
  });
});
