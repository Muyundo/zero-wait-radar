import { spawn } from 'node:child_process';

const processes = [
  spawn('npx', ['--yes', 'tsx', 'server.ts'], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
  spawn('npx', ['--yes', 'tsx', 'simulator.ts'], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
];

let stopping = false;

function stopChild(child, signal) {
  if (!child.pid) return;

  if (process.platform === 'win32') {
    child.kill(signal);
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  processes.forEach((child) => stopChild(child, signal));
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

processes.forEach((child) => {
  child.on('exit', (code) => {
    if (stopping) return;

    stopping = true;
    processes.filter((process) => process !== child).forEach((process) => stopChild(process, 'SIGTERM'));
    process.exitCode = code ?? 1;
  });
});
