/**
 * ConduitCraft on the command line (E2). Run from this repository:
 *
 *   pnpm conduitcraft render <file...> [--format svg|html|json] [--out <path> | --out-dir <dir>] [--scheme light|dark] [--page N|all]
 *   pnpm conduitcraft check <file...> [--strict]
 *   pnpm conduitcraft diff <base> <head> [--name <label>]
 *
 * Files are Blueprint files (`.md`), Blueprint JSON (`.json`) or Mermaid. `check` runs the Review rules on every page
 * and level and exits 1 when any is an error (`--strict`: any warning too). `diff` prints what changed between two
 * versions; a missing `<base>` means a new diagram. Exit codes: 0 fine, 1 problems found or a file unreadable, 2 usage.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { checkDiagram, diffSummary, formatCheck, loadDiagram, renderHtml, renderJson, renderSvgPages } from './cliCore';

const USAGE = `Usage:
  conduitcraft render <file...> [--format svg|html|json] [--out <path> | --out-dir <dir>] [--scheme light|dark] [--page N|all]
  conduitcraft check <file...> [--strict]
  conduitcraft diff <base> <head> [--name <label>]`;

interface Args {
  command: string;
  files: string[];
  flags: Map<string, string | true>;
}

const VALUE_FLAGS = new Set(['format', 'out', 'out-dir', 'scheme', 'page', 'name']);

function parseArgs(argv: string[]): Args {
  const [command = '', ...rest] = argv;
  const files: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (VALUE_FLAGS.has(name)) flags.set(name, rest[(i += 1)] ?? '');
      else flags.set(name, true);
    } else files.push(arg);
  }
  return { command, files, flags };
}

const fail = (message: string, code = 1): never => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

function load(file: string) {
  if (!existsSync(file)) return fail(`${file}: no such file`);
  const result = loadDiagram(readFileSync(file, 'utf8'));
  if (!result.ok) return fail(`${file}: ${result.error}`);
  return result.doc;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const stem = (file: string) => basename(file, extname(file)).replace(/\.blueprint$/, '');

function render(args: Args): void {
  if (args.files.length === 0) fail(USAGE, 2);
  const format = String(args.flags.get('format') ?? 'svg');
  if (!['svg', 'html', 'json'].includes(format)) fail(`Unknown format "${format}". Use svg, html or json.`, 2);
  const scheme = args.flags.get('scheme') === 'dark' ? 'dark' : 'light';
  const out = args.flags.get('out');
  const outDir = args.flags.get('out-dir');
  if (args.files.length > 1 && typeof out === 'string') fail('--out takes one input file. Use --out-dir for several.', 2);
  const page = String(args.flags.get('page') ?? '1');
  for (const file of args.files) {
    const doc = load(file);
    const target = (suffix: string) => (typeof out === 'string' ? out : join(typeof outDir === 'string' ? outDir : '.', `${stem(file)}${suffix}.${format}`));
    if (format === 'svg') {
      const pages = renderSvgPages(doc, scheme);
      if (page === 'all') {
        // One file per page: name-1-overview.svg. With a single page it is just name.svg.
        if (pages.length === 1 && typeof out !== 'string' && !outDir) process.stdout.write(pages[0].svg);
        else for (const p of pages) write(pages.length === 1 ? target('') : (typeof out === 'string' ? out.replace(/(\.svg)?$/, `-${p.number}$1`) : target(`-${p.number}`)), p.svg);
      } else {
        const n = Number(page);
        const chosen = pages[n - 1];
        if (!Number.isInteger(n) || !chosen) fail(`${file}: there is no page ${page} (it has ${pages.length}).`, 2);
        if (typeof out === 'string' || outDir) write(target(''), chosen.svg);
        else process.stdout.write(chosen.svg);
      }
    } else {
      const content = format === 'html' ? renderHtml(doc) : renderJson(doc);
      if (typeof out === 'string' || outDir) write(target(''), content);
      else process.stdout.write(content);
    }
  }
}

function check(args: Args): void {
  if (args.files.length === 0) fail(USAGE, 2);
  const strict = args.flags.get('strict') === true;
  let failed = false;
  for (const file of args.files) {
    const result = checkDiagram(load(file));
    for (const line of formatCheck(file, result)) process.stdout.write(`${line}\n`);
    if (result.errors > 0 || (strict && result.warnings > 0)) failed = true;
  }
  if (failed) process.exit(1);
}

function diff(args: Args): void {
  if (args.files.length !== 2) fail(USAGE, 2);
  const [baseFile, headFile] = args.files;
  const base = existsSync(baseFile) && readFileSync(baseFile, 'utf8').trim() ? load(baseFile) : null;
  const head = existsSync(headFile) ? load(headFile) : null;
  const label = typeof args.flags.get('name') === 'string' ? String(args.flags.get('name')) : headFile;
  process.stdout.write(`${label}: ${diffSummary(base, head)}\n`);
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case 'render':
    render(args);
    break;
  case 'check':
    check(args);
    break;
  case 'diff':
    diff(args);
    break;
  case '--help':
  case 'help':
  case '-h':
    process.stdout.write(`${USAGE}\n`);
    break;
  default:
    fail(USAGE, 2);
}
