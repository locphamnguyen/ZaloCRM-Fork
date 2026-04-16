/**
 * Composable for group poll operations.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface CreatePollPayload {
  question: string;
  options: string[];
  multi?: boolean;
  anonymous?: boolean;
  expireMs?: number;
}

export function usePolls() {
  const polls = ref<any[]>([]);
  const loading = ref(false);

  const base = (accountId: string, groupId: string) =>
    `/zalo-accounts/${accountId}/groups/${groupId}/polls`;

  async function createPoll(accountId: string, groupId: string, payload: CreatePollPayload) {
    loading.value = true;
    try {
      const res = await api.post(base(accountId, groupId), payload);
      polls.value.unshift(res.data.poll);
      return res.data.poll;
    } catch (err) {
      console.error('Failed to create poll:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function getPollDetail(accountId: string, groupId: string, pollId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId, groupId)}/${pollId}`);
      return res.data.poll;
    } catch (err) {
      console.error('Failed to get poll detail:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function votePoll(accountId: string, groupId: string, pollId: string, optionIds: string[]) {
    loading.value = true;
    try {
      const res = await api.post(`${base(accountId, groupId)}/${pollId}/vote`, { optionIds });
      return res.data.result;
    } catch (err) {
      console.error('Failed to vote on poll:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function lockPoll(accountId: string, groupId: string, pollId: string) {
    loading.value = true;
    try {
      const res = await api.post(`${base(accountId, groupId)}/${pollId}/lock`);
      return res.data.result;
    } catch (err) {
      console.error('Failed to lock poll:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { polls, loading, createPoll, getPollDetail, votePoll, lockPoll };
}
