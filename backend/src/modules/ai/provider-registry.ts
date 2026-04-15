/**
 * Central AI provider registry.
 * Reads env-based config to build list of available providers and their models.
 * Only providers with an AUTH_TOKEN are considered "available".
 */
import { config } from '../../config/index.js';

export type ProviderModel = { title: string; value: string };

export type ProviderDef = {
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
  models: ProviderModel[];
};

/** Helper: include model only if env var is set */
function m(title: string, value: string): ProviderModel | null {
  return value ? { title, value } : null;
}

/** Build full provider definitions from config */
function buildProviders(): ProviderDef[] {
  return [
    {
      id: 'anthropic',
      name: 'Anthropic',
      baseUrl: config.anthropicBaseUrl,
      authToken: config.anthropicAuthToken,
      models: [
        m('Claude Opus', config.anthropicDefaultOpusModel),
        m('Claude Sonnet', config.anthropicDefaultSonnetModel),
        m('Claude Haiku', config.anthropicDefaultHaikuModel),
      ].filter(Boolean) as ProviderModel[],
    },
    {
      id: 'gemini',
      name: 'Gemini',
      baseUrl: config.geminiBaseUrl,
      authToken: config.geminiAuthToken,
      models: [
        m('Gemini Pro', config.geminiDefaultProModel),
        m('Gemini Flash', config.geminiDefaultFlashModel),
      ].filter(Boolean) as ProviderModel[],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      baseUrl: config.openaiBaseUrl,
      authToken: config.openaiAuthToken,
      models: [
        m('GPT-4o', config.openaiDefaultGpt4oModel),
        m('GPT-4o Mini', config.openaiDefaultGpt4oMiniModel),
      ].filter(Boolean) as ProviderModel[],
    },
    {
      id: 'qwen',
      name: 'Qwen',
      baseUrl: config.qwenBaseUrl,
      authToken: config.qwenAuthToken,
      models: [
        m('Qwen Plus', config.qwenDefaultPlusModel),
        m('Qwen Turbo', config.qwenDefaultTurboModel),
        m('Qwen Max', config.qwenDefaultMaxModel),
      ].filter(Boolean) as ProviderModel[],
    },
    {
      id: 'kimi',
      name: 'Kimi',
      baseUrl: config.kimiBaseUrl,
      authToken: config.kimiAuthToken,
      models: [
        m('Moonshot V1', config.kimiDefaultMoonshotV1Model),
      ].filter(Boolean) as ProviderModel[],
    },
  ];
}

const providers = buildProviders();

/** Returns providers that have an auth token AND at least one model configured */
export function getAvailableProviders(): Omit<ProviderDef, 'authToken'>[] {
  return providers
    .filter((p) => p.authToken && p.models.length > 0)
    .map(({ authToken: _, ...rest }) => rest);
}

/** Returns full config (including authToken) for a single provider */
export function getProviderConfig(providerId: string): ProviderDef | undefined {
  return providers.find((p) => p.id === providerId);
}
