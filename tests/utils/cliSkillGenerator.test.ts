import { describe, expect, it } from 'vitest';

import {
  buildAdapterStats,
  computeCliSkillDocUpdate,
  extractCliUsageText,
  parseCliUsageSections,
  renderCliSkillDoc,
} from '../../scripts/lib/cli-skill-generator.mjs';

describe('cli-skill generator', () => {
  const cliSource = `
function log(msg: string): void {
  console.error(\`[jshook] \${msg}\`);
}

function usage(): never {
  console.error(\`
jshook — Agent-friendly CLI

COMMANDS:
  Browser Automation:
    eval <script>                         Execute JavaScript in the browser
    snapshot [--max-depth N]              Get accessibility tree with @ref numbers

  Utility:
    doctor                                Check environment health

OPTIONS:
  --json          Force JSON output (default: always JSON)
\`);
  process.exit(0);
}
`;

  it('extracts the CLI usage text from src/cli/index.ts source', () => {
    const usageText = extractCliUsageText(cliSource);
    expect(usageText).toContain('COMMANDS:');
    expect(usageText).toContain('Browser Automation:');
    expect(usageText).not.toContain('[jshook]');
  });

  it('parses command sections from the usage text', () => {
    const sections = parseCliUsageSections(extractCliUsageText(cliSource));

    expect(sections).toEqual([
      {
        title: 'Browser Automation',
        commands: [
          {
            usage: 'eval <script>',
            description: 'Execute JavaScript in the browser',
          },
          {
            usage: 'snapshot [--max-depth N]',
            description: 'Get accessibility tree with @ref numbers',
          },
        ],
      },
      {
        title: 'Utility',
        commands: [
          {
            usage: 'doctor',
            description: 'Check environment health',
          },
        ],
      },
    ]);
  });

  it('builds adapter statistics from the adapter index', () => {
    const stats = buildAdapterStats({
      'reddit/me': { file: 'reddit/me.js' },
      'reddit/post': { file: 'reddit/post.js' },
      'github/repo': { file: 'github/repo.js' },
    });

    expect(stats).toEqual({
      adapterCount: 3,
      platformCount: 2,
    });
  });

  it('renders the generated stats and command overview into the skill doc markers', () => {
    const sourceDoc = `
# Skill Doc

<!-- AUTO-GENERATED:site-adapter-stats:start -->
stale stats
<!-- AUTO-GENERATED:site-adapter-stats:end -->

<!-- AUTO-GENERATED:cli-commands:start -->
stale commands
<!-- AUTO-GENERATED:cli-commands:end -->
`;

    const rendered = renderCliSkillDoc(
      sourceDoc,
      cliSource,
      {
        'reddit/me': { file: 'reddit/me.js' },
        'github/repo': { file: 'github/repo.js' },
      },
      { language: 'zh' },
    );

    expect(rendered).toContain('2 个预置适配器，覆盖 2 个站点目录');
    expect(rendered).toContain('## CLI 命令总览（自动生成）');
    expect(rendered).toContain('| `eval <script>` | Execute JavaScript in the browser |');
    expect(rendered).toContain('| `doctor` | Check environment health |');
    expect(rendered).not.toContain('stale stats');
    expect(rendered).not.toContain('stale commands');
  });

  it('reports whether the skill doc is already up to date', () => {
    const staleDoc = `
# Skill Doc

<!-- AUTO-GENERATED:site-adapter-stats:start -->
stale stats
<!-- AUTO-GENERATED:site-adapter-stats:end -->

<!-- AUTO-GENERATED:cli-commands:start -->
stale commands
<!-- AUTO-GENERATED:cli-commands:end -->
`;

    const changed = computeCliSkillDocUpdate(
      staleDoc,
      cliSource,
      {
        'reddit/me': { file: 'reddit/me.js' },
      },
      { language: 'zh' },
    );

    expect(changed.changed).toBe(true);

    const unchanged = computeCliSkillDocUpdate(
      changed.rendered,
      cliSource,
      {
        'reddit/me': { file: 'reddit/me.js' },
      },
      { language: 'zh' },
    );

    expect(unchanged.changed).toBe(false);
  });
});
