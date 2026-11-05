// Ανάπτυξη: server (με αυτόματη επανεκκίνηση) + Vite dev server.
// Ανοίξτε http://localhost:5173 (τα αιτήματα /api προωθούνται στον server στη θύρα 3000).
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['--watch-path=server', '--watch-path=shared', 'server/index.js'], { stdio: 'inherit', env: { ...process.env, PORT: process.env.PORT || '3000' } }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => code && stop()));
