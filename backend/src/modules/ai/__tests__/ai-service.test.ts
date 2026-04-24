import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectLanguage, escapeXmlBoundary, getAiUsage } from '../ai-service.js';
import { prisma } from '../../../shared/database/prisma-client.js';

vi.mock('../../../shared/database/prisma-client.js', () => ({
  prisma: {
    aiConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    aiSuggestion: {
      count: vi.fn(),
    },
    appSetting: {
      findFirst: vi.fn(),
    },
  },
}));

describe('ai-service unit tests', () => {
  describe('detectLanguage', () => {
    it('should detect Vietnamese with diacritical marks', () => {
      const result = detectLanguage('Xin chào, tôi là khách hàng');
      expect(result).toBe('vi');
    });

    it('should detect Vietnamese with hint phrases', () => {
      const result = detectLanguage('hello there khách hàng needs help');
      expect(result).toBe('vi');
    });

    it('should detect English text', () => {
      const result = detectLanguage('Hello, this is English text');
      expect(result).toBe('en');
    });

    it('should detect mixed text with Vietnamese markers', () => {
      const result = detectLanguage('API khách documentation nhé');
      expect(result).toBe('vi');
    });

    it('should handle empty string', () => {
      const result = detectLanguage('');
      expect(result).toBe('en');
    });

    it('should handle text with only numbers', () => {
      const result = detectLanguage('12345 67890');
      expect(result).toBe('en');
    });
  });

  describe('escapeXmlBoundary', () => {
    it('should remove opening conversation_context tag', () => {
      const text = '<conversation_context>Hello</conversation_context>';
      const result = escapeXmlBoundary(text);
      expect(result).toBe('Hello');
    });

    it('should remove tags case-insensitively', () => {
      const text = '<CONVERSATION_CONTEXT>Test<</CONVERSATION_CONTEXT>';
      const result = escapeXmlBoundary(text);
      expect(result).toBe('Test<');
    });

    it('should handle multiple tags', () => {
      const text = 'start <conversation_context> middle <conversation_context> end </conversation_context>';
      const result = escapeXmlBoundary(text);
      expect(result).toBe('start  middle  end ');
    });

    it('should return unchanged text without tags', () => {
      const text = 'Normal message without tags';
      const result = escapeXmlBoundary(text);
      expect(result).toBe('Normal message without tags');
    });

    it('should handle empty string', () => {
      const result = escapeXmlBoundary('');
      expect(result).toBe('');
    });
  });

  describe('getAiUsage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return correct usage when under quota', async () => {
      const mockConfig = {
        orgId: 'org-1',
        provider: 'anthropic',
        model: 'claude-3',
        maxDaily: 500,
        enabled: true,
        hasAnthropicKey: true,
        hasGeminiKey: false,
        availableProviders: ['anthropic'],
      };

      (prisma.aiConfig.findUnique as any).mockResolvedValue(mockConfig);
      (prisma.aiSuggestion.count as any).mockResolvedValue(100);

      const result = await getAiUsage('org-1');

      expect(result).toEqual({
        usedToday: 100,
        maxDaily: 500,
        remaining: 400,
        enabled: true,
      });
    });

    it('should return zero remaining when quota reached', async () => {
      const mockConfig = {
        orgId: 'org-1',
        provider: 'anthropic',
        model: 'claude-3',
        maxDaily: 500,
        enabled: true,
        hasAnthropicKey: true,
        hasGeminiKey: false,
        availableProviders: ['anthropic'],
      };

      (prisma.aiConfig.findUnique as any).mockResolvedValue(mockConfig);
      (prisma.aiSuggestion.count as any).mockResolvedValue(500);

      const result = await getAiUsage('org-1');

      expect(result.remaining).toBe(0);
    });

    it('should return zero remaining when over quota', async () => {
      const mockConfig = {
        orgId: 'org-1',
        provider: 'anthropic',
        model: 'claude-3',
        maxDaily: 100,
        enabled: true,
        hasAnthropicKey: true,
        hasGeminiKey: false,
        availableProviders: ['anthropic'],
      };

      (prisma.aiConfig.findUnique as any).mockResolvedValue(mockConfig);
      (prisma.aiSuggestion.count as any).mockResolvedValue(150);

      const result = await getAiUsage('org-1');

      expect(result.remaining).toBe(0);
    });

    it('should create config if not found', async () => {
      (prisma.aiConfig.findUnique as any).mockResolvedValue(null);
      (prisma.aiConfig.create as any).mockResolvedValue({
        orgId: 'org-2',
        provider: 'anthropic',
        model: 'claude-3',
        maxDaily: 500,
        enabled: true,
        hasAnthropicKey: true,
        hasGeminiKey: false,
        availableProviders: ['anthropic'],
      });
      (prisma.aiSuggestion.count as any).mockResolvedValue(0);

      const result = await getAiUsage('org-2');

      expect(result.usedToday).toBe(0);
      expect(result.maxDaily).toBe(500);
      expect(result.remaining).toBe(500);
    });
  });
});
