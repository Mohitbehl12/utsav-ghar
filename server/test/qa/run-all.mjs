// Full regression: fresh database per suite → existing e2e suites, unit tests, QA suites, browser suite.
// Every check becomes a row in test/qa/results-*.json.   node test/qa/run-all.mjs [--no-ui]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const QA = path.join(SERVER, 'test/qa');
let proc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function restart(...flags) {
  if (proc) { proc.kill(); await sleep(800); }
  fs.rmSync(path.join(SERVER, 'data'), { recursive: true, force: true });
  execSync(`node src/seed.js ${flags.join(' ')}`, { cwd: SERVER, stdio: 'ignore' });
  proc = spawn('node', ['src/index.js'], { cwd: SERVER, env: { ...process.env, NODE_ENV: 'development', COURIER_WEBHOOK_SECRET: 'test-courier-secret-123456' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://localhost:4000/api/health'); if (r.ok) return; } catch { /* starting */ } await sleep(250); }
  throw new Error('server did not start');
}
const run = (cmd) => { try { return { ok: true, out: execSync(cmd, { cwd: SERVER, maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'pipe'] }).toString() }; } catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` }; } };

const E2E = [['e2e.mjs', 'Store core (orders, payments, admin)', ['--guest-checkout']], ['e2e-crm.mjs', 'Customer messages', ['--guest-checkout']], ['e2e-support.mjs', 'Support & payments', ['--guest-checkout']],
  ['e2e-dealer.mjs', 'Dealer orders', ['--guest-checkout']], ['e2e-dealer-products.mjs', 'Dealer products & pricing', ['--guest-checkout']], ['e2e-security.mjs', 'Security', []],
  ['e2e-pricing.mjs', 'Pricing by PIN', ['--demo', '--guest-checkout']], ['e2e-legal.mjs', 'Legal, onboarding & compliance', []]];
const reg = [];
for (const [file, name, flags] of E2E) {
  await restart(...flags);
  const r = run(`node test/${file}`);
  const lines = r.out.split('\n');
  let n = 0;
  for (const l of lines) {
    const m = l.match(/^(✔|✘) (.*)$/); if (!m) continue; n += 1;
    reg.push({ id: `REG-${file.replace(/\.mjs$/, '').replace('e2e-', '').replace('e2e', 'core').toUpperCase()}-${String(n).padStart(3, '0')}`, module: `Regression · ${name}`, page: file, name: m[2].slice(0, 200), expected: 'As stated', actual: m[1] === '✔' ? 'As stated' : 'Failed', status: m[1] === '✔' ? 'PASS' : 'FAIL', severity: m[1] === '✔' ? '-' : 'High' });
  }
  console.log(`${file}: ${n} checks · ${r.ok ? 'passed' : 'FAILED'}`);
}
// unit tests (node --test, spec reporter)
const u = run('node --test --test-reporter=spec "test/*.test.js"');
let k = 0;
for (const l of u.out.split('\n')) { const m = l.match(/^\s*(✔|✖) (.+?) \(\d/); if (!m || /^\s{4,}/.test(l) === false && l.trim().startsWith('▶')) continue; k += 1; reg.push({ id: `UNIT-${String(k).padStart(3, '0')}`, module: 'Unit tests (shared logic)', page: 'node --test', name: m[2], expected: 'Passes', actual: m[1] === '✔' ? 'Passes' : 'Fails', status: m[1] === '✔' ? 'PASS' : 'FAIL', severity: m[1] === '✔' ? '-' : 'High' }); }
console.log(`unit: ${k} tests`);
fs.writeFileSync(path.join(QA, 'results-regression.json'), JSON.stringify(reg, null, 1));

for (const [suite, flags] of [['customer', []], ['dealer', []], ['admin', []], ['platform', []]]) {
  await restart(...flags);
  const r = run(`node test/qa/qa-${suite}.mjs`);
  console.log(r.out.split('\n').filter((l) => /cases ·/.test(l)).join('\n') || r.out.slice(-500));
}
if (!process.argv.includes('--no-ui')) {
  await restart('--demo');
  const r = run('python3 test/qa/qa_ui.py');
  console.log(r.out.split('\n').filter((l) => /^ui:/.test(l)).join('\n') || r.out.slice(-800));
}
if (proc) proc.kill();
process.exit(0);
