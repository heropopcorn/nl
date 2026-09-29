export type Runtime = { mode: 'preview' | 'local'; profile: 'demo' | 'full'; available: string[] };
let runtime: Runtime | undefined;
export const isLocalWork = () => runtime?.mode === 'local';
export const availableAsset = (src: string) => !runtime || !src.startsWith('/art/') || runtime.available.includes(src);
export const runtimeLabel = () => isLocalWork() ? '本地工作 · 磁盘保存' : '在线预览 · 仅浏览器保存';
export async function initializeRuntime() {
  const response = await fetch('/runtime.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('运行模式配置读取失败，请重新构建');
  const value = await response.json();
  if (!['preview','local'].includes(value.mode) || !['demo','full'].includes(value.profile) || !Array.isArray(value.available)) throw new Error('运行模式配置无效');
  runtime = value as Runtime;
  return runtime;
}
