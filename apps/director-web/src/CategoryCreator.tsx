import { useState } from 'react';
import type { Project } from '../../../packages/core';

export function CategoryCreator({ project, edit, created }: { project: Project; edit: (fn: (p: Project) => void) => void; created: (id: string) => void }) {
  const [name, setName] = useState(''), [error, setError] = useState('');
  return <div className="category-creator"><label>新分类名称<input maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="例如：人物动作、动物、特效"/></label><button onClick={() => {
    const trimmed = name.trim();
    if (!trimmed) { setError('请输入分类名称'); return; }
    if (project.resourceCategories.some(c => c.name === trimmed)) { setError('分类名称已存在'); return; }
    if (project.resourceCategories.length >= 100) { setError('分类最多 100 个'); return; }
    const id = crypto.randomUUID(); edit(p => p.resourceCategories.push({ id, name: trimmed })); setName(''); setError(''); created(id);
  }}>新增分类</button>{error && <p role="alert">{error}</p>}</div>;
}
