import { spawn } from 'node:child_process';

const CHILDREN = [
  spawn(process.execPath, ['--import', 'tsx', 'openride-app-backend/src/provider-main.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PROVIDER_ID: 'harbour' },
  }),
  spawn(process.execPath, ['--import', 'tsx', 'openride-app-backend/src/provider-main.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PROVIDER_ID: 'city' },
  }),
  spawn(process.execPath, ['--import', 'tsx', 'openride-app-backend/src/main.ts'], {
    stdio: 'inherit',
    env: process.env,
  }),
];
let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of CHILDREN) child.kill('SIGTERM');
}
for (const child of CHILDREN) {
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code || 1;
      stop();
    }
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
