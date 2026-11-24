import { spawn } from 'node:child_process';

const processes = [
  spawn('npx', ['--yes', 'tsx', 'server.ts'], { stdio: 'inherit' }),
  spawn('npx', ['--yes', 'tsx', 'simulator.ts'], { stdio: 'inherit' }),
];

let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  processes.forEach((child) => child.kill(signal));
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

processes.forEach((child) => {
  child.on('exit', (code) => {
    if (stopping) return;

    stopping = true;
    processes.filter((process) => process !== child).forEach((process) => process.kill('SIGTERM'));
    process.exitCode = code ?? 1;
  });
});
