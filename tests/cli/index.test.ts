import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  runEnvironmentDoctor: vi.fn(),
  getAdapterIndex: vi.fn(),
  searchAdapters: vi.fn(),
  executeAdapter: vi.fn(),
  resolveAdapter: vi.fn(),
  updateAdaptersFromGitHub: vi.fn(),
}));

vi.mock('@utils/environmentDoctor', () => ({
  runEnvironmentDoctor: state.runEnvironmentDoctor,
}));

vi.mock('@modules/site-adapters/adapter-runtime', () => ({
  getAdapterIndex: state.getAdapterIndex,
  searchAdapters: state.searchAdapters,
  executeAdapter: state.executeAdapter,
  resolveAdapter: state.resolveAdapter,
  updateAdaptersFromGitHub: state.updateAdaptersFromGitHub,
}));

vi.mock('@modules/tmwebdriver', () => ({
  TMWebDriverClient: class {
    async start() {}
    async executeJs() {
      return { data: null };
    }
  },
  ExtensionManager: class {
    async getExtensionPath() {
      return '';
    }
  },
}));

vi.mock('@server/domains/real-browser/handlers/real-browser-handlers', () => ({
  RealBrowserToolHandlers: class {
    async handleListTabs() {
      return { content: [{ type: 'text', text: '[]' }] };
    }
  },
}));

vi.mock('@server/domains/stego/handlers', () => ({
  StegoToolHandlers: class {
    async handleScanFile() {}
  },
}));

vi.mock('@server/domains/pcap-carve/handlers', () => ({
  PcapCarveToolHandlers: class {
    async handleCarveFiles() {}
  },
}));

vi.mock('@server/domains/yara-scan/handlers', () => ({
  YaraScanToolHandlers: class {
    async handleScan() {}
  },
}));

vi.mock('@server/domains/pwn-tools/handlers', () => ({
  PwnToolHandlers: class {
    async handleChecksec() {}
  },
}));

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('cli/index', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.argv = ['node', 'jshook'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('accepts --json before doctor and still runs the doctor command', async () => {
    process.argv = ['node', 'jshook', '--json', 'doctor'];
    state.runEnvironmentDoctor.mockResolvedValue({ ok: true });

    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await import('@src/cli/index');
    await flushMicrotasks();

    expect(state.runEnvironmentDoctor).toHaveBeenCalledWith({ includeBridgeHealth: true });
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('"command":"doctor"'));
    expect(consoleError).toHaveBeenCalledWith('[jshook] command: doctor');
    expect(exit).toHaveBeenCalledWith(0);
  });
});
