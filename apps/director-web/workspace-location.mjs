import path from 'node:path';
import os from 'node:os';
import { realpath, stat } from 'node:fs/promises';

const inside = (root, target) => {
  const relative=path.relative(root,target);
  return !relative || (!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep));
};
async function canonical(filename) {
  try {return await realpath(filename);} catch(e) {
    if(e.code!=='ENOENT') throw e;
    const parent=path.dirname(filename); if(parent===filename) throw e;
    return path.join(await canonical(parent),path.basename(filename));
  }
}
async function exists(filename) {
  try {await stat(filename);return true;} catch(e) {if(e.code==='ENOENT')return false;throw e;}
}
export async function resolveWorkspace({repo,argument,legacyDirectory=path.join(os.homedir(),'YuanliProjects','default')}) {
  const root=await realpath(repo), projects=path.join(root,'projects');
  const target=argument?path.resolve(root,argument):path.join(projects,'default');
  const resolved=await canonical(target);
  // Keep project writes away from source code, .git and generated build folders.
  for(const candidate of [target,resolved]) {
    if(inside(root,candidate) && (!inside(projects,candidate) || candidate===projects)) throw new Error('仓库内的作品请放在 projects/<作品名称>，不能使用仓库根目录或源码目录');
  }
  if(inside(projects,target) && !inside(projects,resolved)) throw new Error('仓库内作品目录不能通过符号链接指向仓库外');
  if(!argument && await exists(path.join(legacyDirectory,'project.json')) && !await exists(path.join(resolved,'project.json'))) {
    throw new Error(`发现旧版作品：${legacyDirectory}。为避免打开空白项目，请先用 --workspace 指定旧目录导出项目包，再显式用 --workspace projects/default 启动并导入；旧目录不会被删除。`);
  }
  return resolved;
}
