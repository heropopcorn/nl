// Preview, tests and local work never rewrite each other's generated assets.
export function buildPaths(env = process.env) {
  const mode = env.NL_MODE || 'preview';
  const profile = env.NL_ASSET_PROFILE || 'demo';
  if (!['preview', 'local'].includes(mode) || !['demo', 'full'].includes(profile) || (mode === 'local' && profile !== 'full')) throw new Error('Invalid NL mode/profile');
  return { mode, profile, publicDir: `.generated/${mode}-${profile}`, outDir: `dist-${mode}${mode === 'preview' && profile === 'full' ? '-full' : ''}` };
}
