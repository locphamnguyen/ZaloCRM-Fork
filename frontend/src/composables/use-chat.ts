import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';

interface ZaloAccount {
  id: string;
  displayName: string | null;
}

export interface AiSentiment {
  label: 'positive' | 'neutral' | 'negative';
  confidence: number;
  reason: string;
}

export interface AiConfig {
  provider: string;
  model: string;
  maxDaily: number;
  enabled: boolean;
  hasAnthropicKey?: boolean;
  hasGeminiKey?: boolean;
}

interface ConversationMessage {
  content: string | null;
  contentType: string;
  senderType: string;
  sentAt: string;
  isDeleted: boolean;
}

export interface Conversation {
  id: string;
  threadType: 'user' | 'group';
  contact: Contact | null;
  zaloAccount: ZaloAccount | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  messages?: ConversationMessage[];
}

export interface Message {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  sentAt: string;
  isDeleted: boolean;
  zaloMsgId: string | null;
}

export function useChat() {
  const conversations = ref<Conversation[]>([]);
  const selectedConvId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loadingConvs = ref(false);
  const loadingMsgs = ref(false);
  const sendingMsg = ref(false);
  const searchQuery = ref('');
  const accountFilter = ref<string | null>(null);
  const aiSuggestion = ref('');
  const aiSuggestionLoading = ref(false);
  const aiSuggestionError = ref('');
  const aiSummary = ref('');
  const aiSummaryLoading = ref(false);
  const aiSentiment = ref<AiSentiment | null>(null);
  const aiSentimentLoading = ref(false);
  const aiUsage = ref({ usedToday: 0, maxDaily: 500, remaining: 500, enabled: true });
  const aiConfig = ref<AiConfig>({ provider: 'anthropic', model: 'claude-sonnet-4-6', maxDaily: 500, enabled: true });
  let socket: Socket | null = null;

  const selectedConv = computed(() =>
    conversations.value.find(c => c.id === selectedConvId.value) || null,
  );

  function clearAiState() {
    aiSuggestion.value = '';
    aiSuggestionError.value = '';
    aiSummary.value = '';
    aiSentiment.value = null;
  }

  const extraFilters = ref<Record<string, string>>({});

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/conversations', {
        params: {
          limit: 100,
          search: searchQuery.value,
          accountId: accountFilter.value || undefined,
          ...extraFilters.value,
        },
      });
      conversations.value = res.data.conversations;
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      loadingConvs.value = false;
    }
  }

  async function fetchMessages(convId: string) {
    loadingMsgs.value = true;
    try {
      const res = await api.get(`/conversations/${convId}/messages`, {
        params: { limit: 100 },
      });
      messages.value = res.data.messages;
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      loadingMsgs.value = false;
    }
  }

  async function fetchAiConfig() {
    try {
      const res = await api.get('/ai/config');
      aiConfig.value = {
        provider: res.data.provider,
        model: res.data.model,
        maxDaily: res.data.maxDaily,
        enabled: res.data.enabled,
        hasAnthropicKey: res.data.hasAnthropicKey,
        hasGeminiKey: res.data.hasGeminiKey,
      };
    } catch (err) {
      console.error('Failed to fetch AI config:', err);
    }
  }

  async function saveAiConfig(payload: AiConfig) {
    const res = await api.put('/ai/config', payload);
    aiConfig.value = {
      provider: res.data.provider,
      model: res.data.model,
      maxDaily: res.data.maxDaily,
      enabled: res.data.enabled,
      hasAnthropicKey: aiConfig.value.hasAnthropicKey,
      hasGeminiKey: aiConfig.value.hasGeminiKey,
    };
  }

  async function fetchAiUsage() {
    try {
      const res = await api.get('/ai/usage');
      aiUsage.value = res.data;
    } catch (err) {
      console.error('Failed to fetch AI usage:', err);
    }
  }

  async function generateAiSuggestion() {
    if (!selectedConvId.value) return;
    aiSuggestionLoading.value = true;
    aiSuggestionError.value = '';
    try {
      const res = await api.post('/ai/suggest', { conversationId: selectedConvId.value });
      aiSuggestion.value = res.data.content || '';
      await fetchAiUsage();
    } catch (err: any) {
      aiSuggestionError.value = err.response?.data?.error || 'Không thể tạo gợi ý AI';
    } finally {
      aiSuggestionLoading.value = false;
    }
  }

  async function generateAiSummary() {
    if (!selectedConvId.value) return;
    aiSummaryLoading.value = true;
    try {
      const res = await api.post(`/ai/summarize/${selectedConvId.value}`);
      aiSummary.value = res.data.content || '';
      await fetchAiUsage();
    } catch (err) {
      console.error('Failed to summarize conversation:', err);
    } finally {
      aiSummaryLoading.value = false;
    }
  }

  async function generateAiSentiment() {
    if (!selectedConvId.value) return;
    aiSentimentLoading.value = true;
    try {
      const res = await api.post(`/ai/sentiment/${selectedConvId.value}`);
      aiSentiment.value = res.data;
      await fetchAiUsage();
    } catch (err) {
      console.error('Failed to analyze sentiment:', err);
    } finally {
      aiSentimentLoading.value = false;
    }
  }

  async function selectConversation(convId: string) {
    selectedConvId.value = convId;
    clearAiState();
    await fetchMessages(convId);
    try {
      const convDetail = await api.get(`/conversations/${convId}`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv && convDetail.data.contact) {
        conv.contact = convDetail.data.contact;
      }
    } catch {
      // Non-critical
    }
    try {
      await api.post(`/conversations/${convId}/mark-read`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) conv.unreadCount = 0;
    } catch {
      // Ignore mark-read errors
    }
    await Promise.allSettled([generateAiSummary(), generateAiSentiment(), fetchAiUsage()]);
  }

  async function sendMessage(content: string) {
    if (!selectedConvId.value || !content.trim()) return;
    await sendMessageTo(selectedConvId.value, content);
  }

  async function sendMessageTo(conversationId: string, content: string) {
    if (!content.trim()) return;
    sendingMsg.value = true;
    try {
      const res = await api.post(`/conversations/${conversationId}/messages`, { content });
      if (conversationId === selectedConvId.value) {
        if (!messages.value.find(m => m.id === res.data.id)) {
          messages.value.push(res.data);
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('chat:message', (data: { message: Message; conversationId: string }) => {
      if (data.conversationId === selectedConvId.value) {
        if (!messages.value.find(m => m.id === data.message.id)) {
          messages.value.push(data.message);
        }
      }
      fetchConversations();
    });

    socket.on('chat:deleted', (data: { msgId: string }) => {
      const msg = messages.value.find(m => m.zaloMsgId === data.msgId);
      if (msg) msg.isDeleted = true;
    });
  }

  function destroySocket() {
    socket?.disconnect();
    socket = null;
  }

  return {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    searchQuery,
    accountFilter,
    extraFilters,
    aiSuggestion,
    aiSuggestionLoading,
    aiSuggestionError,
    aiSummary,
    aiSummaryLoading,
    aiSentiment,
    aiSentimentLoading,
    aiUsage,
    aiConfig,
    fetchConversations,
    fetchAiConfig,
    saveAiConfig,
    fetchAiUsage,
    selectConversation,
    sendMessage,
    sendMessageTo,
    generateAiSuggestion,
    generateAiSummary,
    generateAiSentiment,
    clearAiState,
    initSocket,
    destroySocket,
  };
}
