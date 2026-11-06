import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const [mode, ...args] = process.argv.slice(2);
if (!['dev', 'start'].includes(mode)) throw new Error('Usage: node scripts/run.mjs dev|start [--port PORT]');
const require = createRequire(import.meta.url);
const env = { ...process.env, NODE_ENV: mode === 'start' ? 'production' : 'development' };
let stopping = false;
let worker;
let timer;
function startWorker() {
  worker = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'server/worker/main.ts'], {
    env,
    stdio: 'inherit',
  });
  worker.on('exit', () => {
    if (!stopping) {
      console.error('[export-worker] Restarting interrupted worker.');
      timer = setTimeout(startWorker, 2000);
    }
  });
}
const web = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, ...args], { env, stdio: 'inherit' });
function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  web.kill('SIGTERM');
  worker?.kill('SIGTERM');
  setTimeout(() => {
    web.kill('SIGKILL');
    worker?.kill('SIGKILL');
  }, 30000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
web.on('exit', (code) => {
  process.exitCode = code ?? 0;
  stop();
});
startWorker();
