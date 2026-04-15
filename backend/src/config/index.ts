/**
 * Centralized configuration loader.
 * All environment variables are read once at startup and typed here.
 */
export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-key-change-me-16b',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://crmuser:password@localhost:5432/zalocrm',
  uploadDir: process.env.UPLOAD_DIR || '/var/lib/zalo-crm/files',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  aiDefaultProvider: process.env.AI_DEFAULT_PROVIDER || 'anthropic',
  aiDefaultModel: process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-6',

  /* Legacy keys (kept for backward compat) */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GEMINI_AUTH_TOKEN || '',

  /* --- AI Provider configs --- */
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '',
  anthropicDefaultOpusModel: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
  anthropicDefaultSonnetModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
  anthropicDefaultHaikuModel: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',

  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  geminiAuthToken: process.env.GEMINI_AUTH_TOKEN || process.env.GEMINI_API_KEY || '',
  geminiDefaultProModel: process.env.GEMINI_DEFAULT_PRO_MODEL || '',
  geminiDefaultFlashModel: process.env.GEMINI_DEFAULT_FLASH_MODEL || '',

  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  openaiAuthToken: process.env.OPENAI_AUTH_TOKEN || '',
  openaiDefaultGpt4oModel: process.env.OPENAI_DEFAULT_GPT4O_MODEL || '',
  openaiDefaultGpt4oMiniModel: process.env.OPENAI_DEFAULT_GPT4O_MINI_MODEL || '',

  qwenBaseUrl: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com',
  qwenAuthToken: process.env.QWEN_AUTH_TOKEN || '',
  qwenDefaultPlusModel: process.env.QWEN_DEFAULT_PLUS_MODEL || '',
  qwenDefaultTurboModel: process.env.QWEN_DEFAULT_TURBO_MODEL || '',
  qwenDefaultMaxModel: process.env.QWEN_DEFAULT_MAX_MODEL || '',

  kimiBaseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn',
  kimiAuthToken: process.env.KIMI_AUTH_TOKEN || '',
  kimiDefaultMoonshotV1Model: process.env.KIMI_DEFAULT_MOONSHOT_V1_MODEL || '',

  isProduction: process.env.NODE_ENV === 'production',
};
