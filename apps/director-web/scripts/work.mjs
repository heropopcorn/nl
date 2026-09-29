import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unlockWorkspace } from '../workspace-service.mjs';
import { resolveWorkspace } from '../workspace-location.mjs';
const args = process.argv.slice(2);
const unlock = args.includes('--unlock');
if(unlock) args.splice(args.indexOf('--unlock'),1);
if (args.length && (args[0] !== '--workspace' || args.length !== 2)) throw new Error('用法：npm run work -- --workspace 项目文件夹');
const cwd = fileURLToPath(new URL('../../../', import.meta.url));
const env = { ...process.env, NL_MODE: 'local', NL_ASSET_PROFILE: 'full', NL_WORKSPACE: await resolveWorkspace({repo:cwd,argument:args[1] || process.env.NL_WORKSPACE}) };
if(unlock) { await unlockWorkspace(env.NL_WORKSPACE); console.log('已确认原工作进程不存在，残留锁已解除'); process.exit(0); }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const built = spawnSync(npm, ['run', 'build'], { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
if (built.status !== 0) process.exit(built.status || 1);
const child = spawn(process.execPath, ['apps/director-web/server.mjs'], { cwd, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code || 0));
