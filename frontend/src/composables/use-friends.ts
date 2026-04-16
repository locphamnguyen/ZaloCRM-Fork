import { ref } from 'vue';
import { api } from '@/api/index';

export function useFriends() {
  const friends = ref<any[]>([]);
  const onlineFriends = ref<any[]>([]);
  const sentRequests = ref<any[]>([]);
  const recommendations = ref<any[]>([]);
  const searchResults = ref<any[]>([]);
  const loading = ref(false);

  function base(accountId: string) {
    return `/zalo-accounts/${accountId}/friends`;
  }

  async function fetchFriends(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}`);
      friends.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('fetchFriends failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchOnlineFriends(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/online`);
      onlineFriends.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('fetchOnlineFriends failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchRecommendations(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/recommendations`);
      recommendations.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('fetchRecommendations failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchSentRequests(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/requests/sent`);
      sentRequests.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('fetchSentRequests failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function getRequestStatus(accountId: string, userId: string) {
    try {
      const res = await api.get(`${base(accountId)}/requests/${userId}/status`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('getRequestStatus failed:', err);
      return null;
    }
  }

  async function searchFriends(accountId: string, query: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/find`, { params: { q: query } });
      searchResults.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('searchFriends failed:', err);
      searchResults.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function sendRequest(accountId: string, userId: string, message?: string) {
    try {
      const res = await api.post(`${base(accountId)}/requests`, { userId, message });
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('sendRequest failed:', err);
      return null;
    }
  }

  async function acceptRequest(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/requests/${userId}/accept`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('acceptRequest failed:', err);
      return null;
    }
  }

  async function rejectRequest(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/requests/${userId}/reject`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('rejectRequest failed:', err);
      return null;
    }
  }

  async function cancelRequest(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/requests/${userId}`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('cancelRequest failed:', err);
      return null;
    }
  }

  async function removeFriend(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}`);
      await fetchFriends(accountId);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('removeFriend failed:', err);
      return null;
    }
  }

  async function setAlias(accountId: string, userId: string, alias: string) {
    try {
      const res = await api.put(`${base(accountId)}/${userId}/alias`, { alias });
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('setAlias failed:', err);
      return null;
    }
  }

  async function removeAlias(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}/alias`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('removeAlias failed:', err);
      return null;
    }
  }

  async function blockUser(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/${userId}/block`);
      await fetchFriends(accountId);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('blockUser failed:', err);
      return null;
    }
  }

  async function unblockUser(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}/block`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('unblockUser failed:', err);
      return null;
    }
  }

  async function blockFeed(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/${userId}/block-feed`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('blockFeed failed:', err);
      return null;
    }
  }

  async function unblockFeed(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}/block-feed`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('unblockFeed failed:', err);
      return null;
    }
  }

  return {
    friends,
    onlineFriends,
    sentRequests,
    recommendations,
    searchResults,
    loading,
    fetchFriends,
    fetchOnlineFriends,
    fetchRecommendations,
    fetchSentRequests,
    getRequestStatus,
    searchFriends,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
    setAlias,
    removeAlias,
    blockUser,
    unblockUser,
    blockFeed,
    unblockFeed,
  };
}
