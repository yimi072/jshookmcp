function replaceMarkedSection(source, markerName, content) {
  const pattern = new RegExp(
    `<!-- AUTO-GENERATED:${markerName}:start -->[\\s\\S]*?<!-- AUTO-GENERATED:${markerName}:end -->`,
    'm',
  );
  const replacement = `<!-- AUTO-GENERATED:${markerName}:start -->\n${content}\n<!-- AUTO-GENERATED:${markerName}:end -->`;
  if (!pattern.test(source)) {
    throw new Error(`Missing auto-generated marker block: ${markerName}`);
  }
  return source.replace(pattern, replacement);
}

export function extractCliUsageText(cliSource) {
  const usageMatch = cliSource.match(
    /function\s+usage\(\):\s*never\s*\{\s*console\.error\(`([\s\S]*?)`\);[\s\S]*?\}/m,
  );
  if (!usageMatch?.[1]) {
    throw new Error('Could not extract usage text from src/cli/index.ts');
  }
  return usageMatch[1];
}

export function parseCliUsageSections(usageText) {
  const lines = usageText.split(/\r?\n/);
  const sections = [];
  let currentSection = null;
  let inCommands = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const normalized = line.trimStart();

    if (normalized === 'COMMANDS:') {
      inCommands = true;
      continue;
    }

    if (!inCommands) {
      continue;
    }

    if (normalized === 'OPTIONS:') {
      break;
    }

    const sectionMatch = normalized.match(/^([A-Za-z][A-Za-z /&-]+):$/);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1], commands: [] };
      sections.push(currentSection);
      continue;
    }

    const commandMatch = normalized.match(/^(.+?)\s{2,}(.+)$/);
    if (commandMatch && currentSection) {
      currentSection.commands.push({
        usage: commandMatch[1],
        description: commandMatch[2],
      });
    }
  }

  return sections;
}

export function buildAdapterStats(adapterIndex) {
  const names = Object.keys(adapterIndex);
  const platforms = new Set(names.map((name) => String(name).split('/', 1)[0]).filter(Boolean));

  return {
    adapterCount: names.length,
    platformCount: platforms.size,
  };
}

function renderAdapterStatsLine(adapterIndex, language) {
  const { adapterCount, platformCount } = buildAdapterStats(adapterIndex);
  if (language === 'zh') {
    return `**优势：** ${adapterCount} 个预置适配器，覆盖 ${platformCount} 个站点目录，自动使用当前浏览器登录态。`;
  }
  return `**Strength:** ${adapterCount} bundled adapters across ${platformCount} site directories, automatically reusing the current browser login state.`;
}

function buildCliCommandMarkdown(sections, language) {
  const heading =
    language === 'zh' ? '## CLI 命令总览（自动生成）' : '## CLI Command Overview (Auto-Generated)';
  const intro =
    language === 'zh'
      ? '以下命令分组直接来自 `src/cli/index.ts` 的帮助文本，用来降低文档与实现漂移。'
      : 'These command groups are generated from the help text in `src/cli/index.ts` to reduce drift between docs and implementation.';

  const blocks = sections.map((section) => {
    const rows = section.commands
      .map((command) => `| \`${command.usage}\` | ${command.description} |`)
      .join('\n');
    return `### ${section.title}\n\n| 命令 | 说明 |\n| --- | --- |\n${rows}`;
  });

  return [heading, '', intro, '', ...blocks].join('\n');
}

export function renderCliSkillDoc(sourceDoc, cliSource, adapterIndex, options = {}) {
  const language = options.language === 'en' ? 'en' : 'zh';
  const usageText = extractCliUsageText(cliSource);
  const sections = parseCliUsageSections(usageText);
  let rendered = replaceMarkedSection(
    sourceDoc,
    'site-adapter-stats',
    renderAdapterStatsLine(adapterIndex, language),
  );
  rendered = replaceMarkedSection(
    rendered,
    'cli-commands',
    buildCliCommandMarkdown(sections, language),
  );
  return rendered;
}

export function computeCliSkillDocUpdate(sourceDoc, cliSource, adapterIndex, options = {}) {
  const rendered = renderCliSkillDoc(sourceDoc, cliSource, adapterIndex, options);
  return {
    rendered,
    changed: rendered !== sourceDoc,
  };
}
