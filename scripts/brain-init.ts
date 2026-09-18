/**
 * Seed a Brain from brain-template/ into a directory, and make it a git repo
 * with one commit if it is not one already. Refuses a non-empty directory
 * unless --force, and never overwrites a file that exists.
 *
 *   npm run brain:init -- /absolute/path/to/second-brain [--force]
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
if (target === undefined || !isAbsolute(target)) {
  console.error('usage: npm run brain:init -- /absolute/path [--force]');
  process.exit(2);
}
const dest: string = target;
const template = resolve(import.meta.dirname ?? '.', '..', 'brain-template');
mkdirSync(dest, { recursive: true });
const existing = readdirSync(dest).filter((n) => n !== '.git');
if (existing.length > 0 && !force) {
  console.error(`${dest} is not empty (${existing.length} entries). Pass --force to add missing template files beside them; nothing is overwritten either way.`);
  process.exit(1);
}
let copied = 0;
function walk(rel: string) {
  for (const name of readdirSync(join(template, rel))) {
    const r = join(rel, name);
    const src = join(template, r);
    const dst = join(dest, r);
    if (statSync(src).isDirectory()) {
      mkdirSync(dst, { recursive: true });
      walk(r);
    } else if (!existsSync(dst)) {
      cpSync(src, dst);
      copied++;
    }
  }
}
walk('');
const git = (a: string[]) => execFileSync('git', a, { cwd: dest, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let inited = false;
try {
  git(['rev-parse', '--is-inside-work-tree']);
} catch {
  git(['init', '-q', '-b', 'main']);
  inited = true;
}
git(['add', '-A']);
try {
  git(['-c', 'user.name=agent-os', '-c', 'user.email=agent-os@local', 'commit', '-q', '-m', 'brain: seed from agent-os brain-template']);
  console.log(`seeded ${copied} file(s) into ${dest}${inited ? ' (new git repo, branch main)' : ''}; committed.`);
} catch {
  console.log(`seeded ${copied} file(s) into ${dest}; nothing new to commit.`);
}
console.log('Next: add a remote and push (`git remote add origin …; git push -u origin main`), then `npm run config:init -- --brain ' + dest + '`.');
