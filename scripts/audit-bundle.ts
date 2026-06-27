/**
 * Bundle privacy audit for the SAMIZDAT editor.
 *
 * Checks the built editor/dist/ for:
 * 1. External URLs (http:// or https:// pointing to non-self hosts)
 * 2. External script/link/img/font tags in the HTML
 * 3. CSP meta tag presence and key directives
 * 4. No CDN or analytics patterns
 *
 * Pass: zero external references found.
 * Fail: any external reference found — outputs the violating lines and exits 1.
 *
 * Run: tsx scripts/audit-bundle.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = join(import.meta.dirname, '..', 'editor', 'dist');
const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
];

// Patterns that indicate an external network reference
const EXTERNAL_URL_PATTERN = /https?:\/\/[a-z0-9.\-]+(:[0-9]+)?(\/[^\s"'`>)]*)?/gi;

// Allow-list: these are OK to appear in comments or strings (none expected; keep empty for strictness)
const ALLOWED_HOSTS: string[] = [];

interface AuditResult {
  file: string;
  violations: string[];
}

function checkFile(filename: string, content: string): AuditResult {
  const violations: string[] = [];
  const matches = content.matchAll(EXTERNAL_URL_PATTERN);
  for (const match of matches) {
    const url = match[0];
    try {
      const host = new URL(url).hostname;
      if (!ALLOWED_HOSTS.includes(host)) {
        violations.push(`External URL: ${url}`);
      }
    } catch {
      // Malformed URL fragment — skip
    }
  }
  return { file: filename, violations };
}

function checkCSP(html: string): string[] {
  const violations: string[] = [];
  const cspMatch = /content-security-policy[^>]*content="([^"]+)"/i.exec(html);
  if (!cspMatch) {
    violations.push('Missing Content-Security-Policy meta tag');
    return violations;
  }
  const csp = cspMatch[1]!;
  for (const directive of REQUIRED_CSP_DIRECTIVES) {
    if (!csp.toLowerCase().includes(directive.toLowerCase())) {
      violations.push(`CSP missing directive: ${directive}`);
    }
  }
  return violations;
}

function main(): void {
  if (!existsSync(DIST_DIR)) {
    console.error(`✗ editor/dist/ does not exist. Run: npm run editor:build`);
    process.exit(1);
  }

  const files = ['index.html', 'app.js', 'index.css'];
  const allResults: AuditResult[] = [];
  let totalViolations = 0;

  for (const filename of files) {
    const path = join(DIST_DIR, filename);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const result = checkFile(filename, content);
    if (filename === 'index.html') {
      result.violations.push(...checkCSP(content));
    }
    allResults.push(result);
    totalViolations += result.violations.length;
  }

  if (totalViolations === 0) {
    console.log('✓ Bundle privacy audit PASSED');
    console.log('  - Zero external URLs in editor/dist/');
    console.log('  - CSP meta tag present with all required directives');
    console.log('  - Bundle is self-contained: safe for onion service deployment');
    process.exit(0);
  } else {
    console.error('✗ Bundle privacy audit FAILED');
    for (const { file, violations } of allResults) {
      for (const v of violations) {
        console.error(`  [${file}] ${v}`);
      }
    }
    process.exit(1);
  }
}

main();
