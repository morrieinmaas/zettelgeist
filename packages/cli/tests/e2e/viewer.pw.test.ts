import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, '..', '..', 'dist', 'bin.js');

let tmp: string;
let proc: ChildProcess | null = null;
const PORT = 17681;  // unique port for the e2e run

test.beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-pw-e2e-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# Foo\n');
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [ ] 1. one\n- [ ] 2. two\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });

  proc = spawn('node', [BIN, 'serve', '--port', String(PORT), '--no-open'], {
    cwd: tmp,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to be ready
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/specs`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
});

test.afterAll(async () => {
  if (proc) {
    proc.kill();
    await new Promise((r) => setTimeout(r, 100));
  }
  await fs.rm(tmp, { recursive: true, force: true });
});

test('board view loads with one card', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.zg-board', { timeout: 10_000 });
  const cards = await page.locator('.zg-card').all();
  expect(cards.length).toBe(1);
  const cardName = await page.locator('.zg-card-name').textContent();
  expect(cardName).toBe('foo');
});

test('mobile-responsive at 375x667', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.zg-board');
  // At mobile width, columns stack vertically (grid-template-columns: 1fr)
  const board = page.locator('.zg-board');
  const gridCols = await board.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  // Single-column layout should not contain multiple distinct widths
  expect(gridCols.split(' ').length).toBeLessThanOrEqual(2);  // possibly with trailing 0px
});

test('clicking a card navigates to spec detail', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator('.zg-card[data-spec="foo"]').click();
  await page.waitForSelector('.zg-detail-header h2');
  const heading = await page.locator('.zg-detail-header h2').textContent();
  expect(heading).toBe('foo');
});

test('clicking a checkbox flips the task and produces a commit', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/#/spec/foo`);
  await page.waitForSelector('.zg-tab-nav');
  await page.locator('.zg-tab-nav button:has-text("Tasks")').click();
  await page.waitForSelector('.zg-task-list');

  const firstCheckbox = page.locator('.zg-task-list input[type="checkbox"]').first();
  await firstCheckbox.check();
  await page.waitForTimeout(500);  // give backend time to commit

  // Verify on disk the task was flipped + a commit was made
  const tasksContent = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
  expect(tasksContent.split('\n')[0]).toContain('[x]');

  const { stdout } = await execFileP('git', ['log', '-1', '--pretty=%s'], { cwd: tmp });
  expect(stdout.trim()).toMatch(/\[zg\] tick: foo#1/);
});
