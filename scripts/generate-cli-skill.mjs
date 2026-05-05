import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCliSkillDocUpdate } from './lib/cli-skill-generator.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const cliSourcePath = join(projectRoot, 'src', 'cli', 'index.ts');
const adapterIndexPath = join(projectRoot, 'src', 'assets', 'bb-sites', 'index.json');
const cliSkillDocPath = join(projectRoot, 'docs', 'cli-skill.md');

async function main() {
  const checkOnly = process.argv.includes('--check');
  const [cliSource, adapterIndexRaw, skillDoc] = await Promise.all([
    readFile(cliSourcePath, 'utf8'),
    readFile(adapterIndexPath, 'utf8'),
    readFile(cliSkillDocPath, 'utf8'),
  ]);

  const { rendered, changed } = computeCliSkillDocUpdate(
    skillDoc,
    cliSource,
    JSON.parse(adapterIndexRaw),
    { language: 'zh' },
  );

  if (changed && checkOnly) {
    console.error(
      '[docs] docs/cli-skill.md is out of date. Run: node scripts/generate-cli-skill.mjs',
    );
    process.exit(1);
  }

  if (changed) {
    await writeFile(cliSkillDocPath, rendered, 'utf8');
    console.log('[docs] Updated docs/cli-skill.md from CLI metadata');
    return;
  }

  console.log('[docs] docs/cli-skill.md already up to date');
}

main().catch((error) => {
  console.error(`[docs] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
