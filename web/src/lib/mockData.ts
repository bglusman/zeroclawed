import type {
  CliTool,
  ComponentHealth,
  CostSummary,
  CronJob,
  DiagResult,
  HealthSnapshot,
  Integration,
  IntegrationSettingsPayload,
  MemoryEntry,
  PairedDevice,
  StatusResponse,
  ToolSpec,
} from '@/types/api';

interface MockResponse {
  status: number;
  body?: unknown;
}

const MOCK_LATENCY_MS = 120;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonBody(options: RequestInit): Record<string, unknown> {
  if (typeof options.body !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(options.body) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse failures and return empty map.
  }

  return {};
}

function deepClone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function ok(body: unknown): MockResponse {
  return { status: 200, body };
}

function noContent(): MockResponse {
  return { status: 204 };
}

function error(status: number, message: string): MockResponse {
  return { status, body: { error: message } };
}

function buildHealthComponent(status: string, restartCount = 0): ComponentHealth {
  const now = new Date().toISOString();
  return {
    status,
    updated_at: now,
    last_ok: status === 'ok' ? now : null,
    last_error: status === 'ok' ? null : now,
    restart_count: restartCount,
  };
}

function buildMockHealth(): HealthSnapshot {
  const now = new Date().toISOString();
  return {
    pid: 4242,
    updated_at: now,
    uptime_seconds: 68420,
    components: {
      gateway: buildHealthComponent('ok'),
      provider: buildHealthComponent('ok'),
      memory: buildHealthComponent('degraded', 1),
      channels: buildHealthComponent('ok'),
    },
  };
}

function buildMockStatus(): StatusResponse {
  return {
    provider: 'openai',
    model: 'gpt-5.2',
    temperature: 0.4,
    uptime_seconds: 68420,
    gateway_port: 42617,
    locale: 'en-US',
    memory_backend: 'sqlite',
    paired: true,
    channels: {
      telegram: true,
      discord: false,
      whatsapp: true,
      github: true,
    },
    health: buildMockHealth(),
  };
}

function buildMockCost(): CostSummary {
  return {
    session_cost_usd: 0.0842,
    daily_cost_usd: 1.3026,
    monthly_cost_usd: 14.9875,
    total_tokens: 182_342,
    request_count: 426,
    by_model: {
      'gpt-5.2': {
        model: 'gpt-5.2',
        cost_usd: 11.4635,
        total_tokens: 141_332,
        request_count: 292,
      },
      'claude-sonnet-4-5': {
        model: 'claude-sonnet-4-5',
        cost_usd: 3.524,
        total_tokens: 41_010,
        request_count: 134,
      },
    },
  };
}

function buildMockTools(): ToolSpec[] {
  return [
    {
      name: 'shell',
      description: 'Run shell commands inside the workspace',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
    {
      name: 'file_read',
      description: 'Read files from disk',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'web_fetch',
      description: 'Fetch and parse HTTP resources',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  ];
}

function buildMockCronJobs(): CronJob[] {
  return [
    {
      id: 'mock-cron-1',
      name: 'Daily sync',
      command: 'zeroclaw sync --channels',
      next_run: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      last_run: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      last_status: 'ok',
      enabled: true,
    },
    {
      id: 'mock-cron-2',
      name: 'Budget audit',
      command: 'zeroclaw cost audit',
      next_run: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      last_run: null,
      last_status: null,
      enabled: false,
    },
  ];
}

function buildMockIntegrations(): Integration[] {
  return [
    {
      name: 'Slack',
      description: 'Slack bot messaging and thread orchestration',
      category: 'Channels',
      status: 'Active',
    },
    {
      name: 'GitHub',
      description: 'PR and issue automation',
      category: 'Automation',
      status: 'Available',
    },
    {
      name: 'Linear',
      description: 'Issue workflow sync',
      category: 'Productivity',
      status: 'ComingSoon',
    },
  ];
}

function buildMockIntegrationSettings(): IntegrationSettingsPayload {
  return {
    revision: 'mock-revision-17',
    active_default_provider_integration_id: 'openai',
    integrations: [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'Primary LLM provider',
        category: 'Providers',
        status: 'Active',
        configured: true,
        activates_default_provider: true,
        fields: [
          {
            key: 'api_key',
            label: 'API Key',
            required: true,
            has_value: true,
            input_type: 'secret',
            options: [],
            masked_value: 'sk-****abcd',
          },
        ],
      },
      {
        id: 'slack',
        name: 'Slack',
        description: 'Workspace notifications and bot relay',
        category: 'Channels',
        status: 'Available',
        configured: false,
        activates_default_provider: false,
        fields: [
          {
            key: 'bot_token',
            label: 'Bot Token',
            required: true,
            has_value: false,
            input_type: 'secret',
            options: [],
          },
        ],
      },
    ],
  };
}

function buildMockMemory(): MemoryEntry[] {
  return [
    {
      id: 'mem-1',
      key: 'ops.runbook.gateway',
      content: 'Restart gateway with `zeroclaw gateway --open-dashboard` after updates.',
      category: 'operations',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      session_id: 'sess_42',
      score: 0.92,
    },
    {
      id: 'mem-2',
      key: 'cost.budget.daily',
      content: 'Daily soft budget threshold is $2.50 for development environments.',
      category: 'cost',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      session_id: null,
      score: 0.88,
    },
  ];
}

function buildMockDevices(): PairedDevice[] {
  return [
    {
      id: 'device-1',
      token_fingerprint: 'zc_3f2a...19d0',
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      paired_by: 'localhost',
    },
    {
      id: 'device-2',
      token_fingerprint: 'zc_09ac...7e4f',
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      paired_by: 'vpn',
    },
  ];
}

function buildMockCliTools(): CliTool[] {
  return [
    {
      name: 'git',
      path: '/usr/bin/git',
      version: '2.46.1',
      category: 'vcs',
    },
    {
      name: 'cargo',
      path: '/Users/mock/.cargo/bin/cargo',
      version: '1.87.0',
      category: 'build',
    },
    {
      name: 'npm',
      path: '/opt/homebrew/bin/npm',
      version: '11.3.0',
      category: 'package-manager',
    },
  ];
}

function buildMockDiagnostics(): DiagResult[] {
  return [
    {
      severity: 'ok',
      category: 'runtime',
      message: 'Gateway listeners are healthy.',
    },
    {
      severity: 'warn',
      category: 'cost',
      message: 'Daily spend crossed 50% threshold.',
    },
    {
      severity: 'ok',
      category: 'security',
      message: 'Pairing mode is enabled.',
    },
  ];
}

const mockConfig = `[gateway]
host = "127.0.0.1"
port = 42617
require_pairing = true

[agent]
max_tool_iterations = 24
`;

function routeMockResponse(path: string, options: RequestInit): MockResponse {
  const method = (options.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'http://zeroclaw.mock');
  const body = parseJsonBody(options);
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/health') {
    return ok({ require_pairing: false, paired: true });
  }

  if (method === 'POST' && pathname === '/pair') {
    const code = String(body.code ?? '').trim();
    if (code.length > 0 && code.length < 6) {
      return error(400, 'Mock pairing code must have at least 6 characters');
    }
    return ok({ token: 'mock-token-zeroclaw' });
  }

  if (method === 'GET' && pathname === '/api/status') {
    return ok(buildMockStatus());
  }

  if (method === 'GET' && pathname === '/api/health') {
    return ok({ health: buildMockHealth() });
  }

  if (method === 'GET' && pathname === '/api/cost') {
    return ok({ cost: buildMockCost() });
  }

  if (method === 'GET' && pathname === '/api/tools') {
    return ok({ tools: buildMockTools() });
  }

  if (method === 'GET' && pathname === '/api/cron') {
    return ok({ jobs: buildMockCronJobs() });
  }

  if (method === 'POST' && pathname === '/api/cron') {
    const command = String(body.command ?? '').trim();
    const schedule = String(body.schedule ?? '').trim();
    if (!command || !schedule) {
      return error(400, 'command and schedule are required');
    }

    const newJob: CronJob = {
      id: `mock-cron-${Date.now().toString(36)}`,
      name: typeof body.name === 'string' ? body.name : null,
      command,
      next_run: new Date(Date.now() + 60 * 1000).toISOString(),
      last_run: null,
      last_status: null,
      enabled: body.enabled === false ? false : true,
    };
    return ok({ status: 'created', job: newJob });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/cron/')) {
    return noContent();
  }

  if (method === 'GET' && pathname === '/api/integrations') {
    return ok({ integrations: buildMockIntegrations() });
  }

  if (method === 'GET' && pathname === '/api/integrations/settings') {
    return ok(buildMockIntegrationSettings());
  }

  if (
    method === 'PUT'
    && pathname.startsWith('/api/integrations/')
    && pathname.endsWith('/credentials')
  ) {
    return ok({ status: 'ok', revision: `mock-revision-${Date.now().toString(36)}` });
  }

  if (method === 'GET' && pathname === '/api/memory') {
    return ok({ entries: buildMockMemory() });
  }

  if (method === 'POST' && pathname === '/api/memory') {
    return ok({ status: 'stored' });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/memory/')) {
    return noContent();
  }

  if (method === 'GET' && pathname === '/api/pairing/devices') {
    return ok({ devices: buildMockDevices() });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/pairing/devices/')) {
    return noContent();
  }

  if (method === 'GET' && pathname === '/api/config') {
    return ok({ format: 'toml', content: mockConfig });
  }

  if (method === 'PUT' && pathname === '/api/config') {
    return ok({ status: 'saved' });
  }

  if ((method === 'POST' || method === 'GET') && pathname === '/api/doctor') {
    return ok({ results: buildMockDiagnostics() });
  }

  if (method === 'GET' && pathname === '/api/cli-tools') {
    return ok({ cli_tools: buildMockCliTools() });
  }

  return error(404, `No mock route for ${method} ${pathname}`);
}

export async function mockApiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = routeMockResponse(path, options);
  await wait(MOCK_LATENCY_MS);

  if (response.status >= 400) {
    const errorPayload = response.body ?? { error: 'Unknown mock API error' };
    const message =
      typeof errorPayload === 'string' ? errorPayload : JSON.stringify(errorPayload);
    throw new Error(`API ${response.status}: ${message}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return deepClone(response.body) as T;
}
