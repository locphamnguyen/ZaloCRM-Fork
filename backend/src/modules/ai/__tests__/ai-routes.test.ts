import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fastify } from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { aiRoutes } from '../ai-routes.js';
import { prisma } from '../../../shared/database/prisma-client.js';

// Mock dependencies
vi.mock('../../../shared/database/prisma-client.js', () => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(),
    },
    zaloAccountAccess: {
      findFirst: vi.fn(),
    },
    aiConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    aiSuggestion: {
      count: vi.fn(),
      create: vi.fn(),
    },
    appSetting: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../ai-service.js', () => ({
  generateAiOutput: vi.fn(),
  getAiConfig: vi.fn(),
  updateAiConfig: vi.fn(),
  getAiUsage: vi.fn(),
}));

vi.mock('../provider-registry.js', () => ({
  getProviderConfig: vi.fn((provider) => {
    if (provider === 'anthropic') return { authToken: 'test-key', baseUrl: 'https://api.anthropic.com' };
    if (provider === 'gemini') return { authToken: 'test-key', baseUrl: 'https://api.gemini.com' };
    return null;
  }),
  getAvailableProviders: vi.fn(() => [
    { name: 'anthropic', models: ['claude-3'] },
    { name: 'gemini', models: ['gemini-pro'] },
  ]),
}));

// Mock auth middleware
vi.mock('../../../modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any, _reply: any) => {
    request.user = {
      id: 'user-1',
      orgId: 'org-1',
      role: 'admin',
    };
  },
}));

// Mock role middleware
vi.mock('../../../modules/auth/role-middleware.js', () => ({
  requireRole: (...roles: string[]) => async (request: any, reply: any) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  },
}));

// Mock zalo access middleware
vi.mock('../../../modules/zalo/zalo-access-middleware.js', () => ({
  requireZaloAccess: (_permission: string) => async (request: any, _reply: any) => {
    // Just a passthrough for tests
  },
}));

describe('ai-routes integration tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = fastify();

    // Register routes directly (auth already mocked above)
    await app.register(async (fastifyApp) => {
      await aiRoutes(fastifyApp);
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/ai/providers', () => {
    it('should return available providers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/providers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /api/v1/ai/config', () => {
    it('should return AI config', async () => {
      const { getAiConfig } = await import('../ai-service.js');
      (getAiConfig as any).mockResolvedValue({
        orgId: 'org-1',
        provider: 'anthropic',
        model: 'claude-3',
        maxDaily: 500,
        enabled: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.provider).toBe('anthropic');
      expect(body.maxDaily).toBe(500);
    });
  });

  describe('PUT /api/v1/ai/config', () => {
    it('should update config for admin', async () => {
      const { updateAiConfig } = await import('../ai-service.js');
      (updateAiConfig as any).mockResolvedValue({
        orgId: 'org-1',
        provider: 'gemini',
        model: 'gemini-pro',
        maxDaily: 1000,
        enabled: true,
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/ai/config',
        payload: {
          provider: 'gemini',
          maxDaily: 1000,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.provider).toBe('gemini');
      expect(body.maxDaily).toBe(1000);
    });

    it('should reject update with invalid maxDaily', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/ai/config',
        payload: {
          maxDaily: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('at least 1');
    });
  });

  describe('GET /api/v1/ai/usage', () => {
    it('should return usage stats', async () => {
      const { getAiUsage } = await import('../ai-service.js');
      (getAiUsage as any).mockResolvedValue({
        usedToday: 100,
        maxDaily: 500,
        remaining: 400,
        enabled: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/usage',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.usedToday).toBe(100);
      expect(body.maxDaily).toBe(500);
      expect(body.remaining).toBe(400);
    });
  });

  describe('POST /api/v1/ai/suggest', () => {
    it('should suggest reply draft', async () => {
      const aiService = await import('../ai-service.js');

      (prisma.conversation.findFirst as any).mockResolvedValue({
        id: 'conv-1',
        orgId: 'org-1',
        zaloAccountId: 'acc-1',
        contact: { fullName: 'John' },
        messages: [],
      });

      (aiService.generateAiOutput as any).mockResolvedValue({
        content: 'Suggested reply',
        confidence: 0.8,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/suggest',
        payload: {
          conversationId: 'conv-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toBe('Suggested reply');
    });

    it('should return 400 when conversationId missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/suggest',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('required');
    });

    it('should return 404 when conversation not found', async () => {
      (prisma.conversation.findFirst as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/suggest',
        payload: {
          conversationId: 'invalid-conv',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 429 when quota exceeded', async () => {
      const aiService = await import('../ai-service.js');

      (prisma.conversation.findFirst as any).mockResolvedValue({
        id: 'conv-1',
        orgId: 'org-1',
        zaloAccountId: 'acc-1',
      });

      (aiService.generateAiOutput as any).mockRejectedValue(new Error('AI daily quota exceeded'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/suggest',
        payload: {
          conversationId: 'conv-1',
        },
      });

      expect(response.statusCode).toBe(429);
    });

    it('should return 400 when provider not configured', async () => {
      const aiService = await import('../ai-service.js');

      (prisma.conversation.findFirst as any).mockResolvedValue({
        id: 'conv-1',
        orgId: 'org-1',
        zaloAccountId: 'acc-1',
      });

      (aiService.generateAiOutput as any).mockRejectedValue(new Error('AI provider key is not configured'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/suggest',
        payload: {
          conversationId: 'conv-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/ai/summarize/:id', () => {
    it('should summarize conversation', async () => {
      const aiService = await import('../ai-service.js');

      (prisma.conversation.findFirst as any).mockResolvedValue({
        id: 'conv-1',
        orgId: 'org-1',
        zaloAccountId: 'acc-1',
      });

      (aiService.generateAiOutput as any).mockResolvedValue({
        content: 'Summary of conversation',
        confidence: 0.8,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/summarize/conv-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toContain('Summary');
    });
  });

  describe('POST /api/v1/ai/sentiment/:id', () => {
    it('should analyze sentiment', async () => {
      const aiService = await import('../ai-service.js');

      (prisma.conversation.findFirst as any).mockResolvedValue({
        id: 'conv-1',
        orgId: 'org-1',
        zaloAccountId: 'acc-1',
      });

      (aiService.generateAiOutput as any).mockResolvedValue({
        label: 'positive',
        confidence: 0.85,
        reason: 'Customer satisfied',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/sentiment/conv-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.label).toBe('positive');
      expect(body.confidence).toBe(0.85);
    });
  });
});
