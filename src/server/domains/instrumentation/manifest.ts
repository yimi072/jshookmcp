import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { instrumentationTools } from '@server/domains/instrumentation/definitions';
import type { InstrumentationHandlers } from '@server/domains/instrumentation/handlers';
import type { InstrumentationSessionManager } from '@server/instrumentation/InstrumentationSession';
import type { EvidenceGraphBridge } from '@server/instrumentation/EvidenceGraphBridge';
import type { ReverseEvidenceGraph } from '@server/evidence/ReverseEvidenceGraph';
import type { ToolResponse } from '@server/types';

const DOMAIN = 'instrumentation' as const;
const DEP_KEY = 'instrumentationHandlers' as const;
type H = InstrumentationHandlers;
const t = toolLookup(instrumentationTools);
const registrations = defineMethodRegistrations<H, (typeof instrumentationTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  entries: [
    { tool: 'instrumentation_session', method: 'handleSessionDispatch' },
    { tool: 'instrumentation_operation', method: 'handleOperationDispatch' },
    { tool: 'instrumentation_artifact', method: 'handleArtifactDispatch' },
    { tool: 'instrumentation_hook_preset', method: 'handleHookPreset' },
    { tool: 'instrumentation_network_replay', method: 'handleNetworkReplay' },
  ],
});

interface HookPresetHandlerLike {
  handleHookPreset(args: Record<string, unknown>): Promise<ToolResponse>;
}

interface NetworkReplayHandlerLike {
  handleNetworkReplayRequest(args: Record<string, unknown>): Promise<ToolResponse>;
}

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { ReverseEvidenceGraph } = await import('@server/evidence/ReverseEvidenceGraph');
  const { InstrumentationSessionManager } =
    await import('@server/instrumentation/InstrumentationSession');
  const { EvidenceGraphBridge } = await import('@server/instrumentation/EvidenceGraphBridge');
  const { InstrumentationHandlers } = await import('@server/domains/instrumentation/handlers');
  const hookPresetHandlers = ctx.handlerDeps.hookPresetHandlers as unknown as
    | HookPresetHandlerLike
    | undefined;
  const advancedHandlers = ctx.handlerDeps.advancedHandlers as unknown as
    | NetworkReplayHandlerLike
    | undefined;

  // Dynamic imports — load only when domain is first accessed

  let graph = ctx.getDomainInstance<ReverseEvidenceGraph>('evidenceGraph');
  if (!graph) {
    graph = new ReverseEvidenceGraph();
    ctx.setDomainInstance('evidenceGraph', graph);
  }

  let sessionManager = ctx.getDomainInstance<InstrumentationSessionManager>(
    'instrumentationSessionManager',
  );
  if (!sessionManager) {
    sessionManager = new InstrumentationSessionManager();
    ctx.setDomainInstance('instrumentationSessionManager', sessionManager);
  }

  let bridge = ctx.getDomainInstance<EvidenceGraphBridge>('evidenceGraphBridge');
  if (!bridge) {
    bridge = new EvidenceGraphBridge(graph);
    ctx.setDomainInstance('evidenceGraphBridge', bridge);
  }

  sessionManager.setEvidenceBridge(bridge);

  if (!ctx.instrumentationHandlers) {
    ctx.instrumentationHandlers = new InstrumentationHandlers(sessionManager, {
      hookPresetHandlers: hookPresetHandlers!,
      advancedHandlers: advancedHandlers!,
    });
  }
  return ctx.instrumentationHandlers;
}

const manifest = {
  kind: 'domain-manifest',
  version: 1,
  domain: DOMAIN,
  depKey: DEP_KEY,
  profiles: ['full'],
  ensure,

  workflowRule: {
    patterns: [
      /(hook|intercept|trace|instrument).*(session|unified|manage|all)/i,
      /(session|统一|会话).*(hook|拦截|追踪|仪器化|instrument)/i,
    ],
    priority: 95,
    tools: [
      'instrumentation_session',
      'instrumentation_operation',
      'instrumentation_artifact',
      'instrumentation_hook_preset',
      'instrumentation_network_replay',
    ],
    hint:
      'Instrumentation session: create session → attach hook presets / network replay → record artifacts → query ' +
      'artifacts → destroy when done',
  },
  registrations,
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
