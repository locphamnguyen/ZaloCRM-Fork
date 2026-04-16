/**
 * Composable wrapping all group management API endpoints.
 * All methods take accountId as first param (from useSelectedAccount).
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export function useGroups() {
  const groups = ref<any[]>([]);
  const selectedGroup = ref<any | null>(null);
  const members = ref<any[]>([]);
  const blocked = ref<any[]>([]);
  const pending = ref<any[]>([]);
  const loading = ref(false);
  const actionLoading = ref(false);

  const base = (accountId: string) => `/zalo-accounts/${accountId}/groups`;

  async function fetchGroups(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(base(accountId));
      groups.value = res.data.groups ?? [];
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchGroup(accountId: string, groupId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/${groupId}`);
      selectedGroup.value = res.data.group;
      return res.data.group;
    } catch (err) {
      console.error('Failed to fetch group:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMembers(accountId: string, groupId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/${groupId}/members`);
      members.value = res.data.members ?? [];
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      loading.value = false;
    }
  }

  async function createGroup(accountId: string, payload: { name: string; memberIds: string[] }) {
    actionLoading.value = true;
    try {
      const res = await api.post(base(accountId), payload);
      await fetchGroups(accountId);
      return res.data.group;
    } catch (err) {
      console.error('Failed to create group:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function renameGroup(accountId: string, groupId: string, name: string) {
    actionLoading.value = true;
    try {
      const res = await api.patch(`${base(accountId)}/${groupId}/name`, { name });
      return res.data.result;
    } catch (err) {
      console.error('Failed to rename group:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function updateSettings(accountId: string, groupId: string, settings: Record<string, any>) {
    actionLoading.value = true;
    try {
      const res = await api.patch(`${base(accountId)}/${groupId}/settings`, settings);
      return res.data.result;
    } catch (err) {
      console.error('Failed to update settings:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function addMembers(accountId: string, groupId: string, userIds: string[]) {
    actionLoading.value = true;
    try {
      const res = await api.post(`${base(accountId)}/${groupId}/members`, { userIds });
      return res.data.result;
    } catch (err) {
      console.error('Failed to add members:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function removeMembers(accountId: string, groupId: string, userIds: string[]) {
    actionLoading.value = true;
    try {
      const res = await api.delete(`${base(accountId)}/${groupId}/members`, { data: { userIds } });
      return res.data.result;
    } catch (err) {
      console.error('Failed to remove members:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function addDeputy(accountId: string, groupId: string, userId: string) {
    actionLoading.value = true;
    try {
      const res = await api.post(`${base(accountId)}/${groupId}/deputies`, { userId });
      return res.data.result;
    } catch (err) {
      console.error('Failed to add deputy:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function removeDeputy(accountId: string, groupId: string, userId: string) {
    actionLoading.value = true;
    try {
      const res = await api.delete(`${base(accountId)}/${groupId}/deputies/${userId}`);
      return res.data.result;
    } catch (err) {
      console.error('Failed to remove deputy:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function transferOwnership(accountId: string, groupId: string, newOwnerId: string) {
    actionLoading.value = true;
    try {
      const res = await api.post(`${base(accountId)}/${groupId}/transfer`, { newOwnerId });
      return res.data.result;
    } catch (err) {
      console.error('Failed to transfer ownership:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function blockMember(accountId: string, groupId: string, userId: string) {
    actionLoading.value = true;
    try {
      const res = await api.post(`${base(accountId)}/${groupId}/block`, { userId });
      return res.data.result;
    } catch (err) {
      console.error('Failed to block member:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function unblockMember(accountId: string, groupId: string, userId: string) {
    actionLoading.value = true;
    try {
      const res = await api.delete(`${base(accountId)}/${groupId}/block/${userId}`);
      return res.data.result;
    } catch (err) {
      console.error('Failed to unblock member:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function fetchBlocked(accountId: string, groupId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/${groupId}/blocked`);
      blocked.value = res.data.blocked ?? [];
    } catch (err) {
      console.error('Failed to fetch blocked:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchPending(accountId: string, groupId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/${groupId}/pending`);
      pending.value = res.data.pending ?? [];
    } catch (err) {
      console.error('Failed to fetch pending:', err);
    } finally {
      loading.value = false;
    }
  }

  async function getInviteLink(accountId: string, groupId: string) {
    try {
      const res = await api.get(`${base(accountId)}/${groupId}/link`);
      return res.data.link;
    } catch (err) {
      console.error('Failed to get invite link:', err);
      return null;
    }
  }

  async function leaveGroup(accountId: string, groupId: string) {
    actionLoading.value = true;
    try {
      const res = await api.post(`${base(accountId)}/${groupId}/leave`);
      await fetchGroups(accountId);
      return res.data.result;
    } catch (err) {
      console.error('Failed to leave group:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  async function disperseGroup(accountId: string, groupId: string) {
    actionLoading.value = true;
    try {
      const res = await api.post(`${base(accountId)}/${groupId}/disperse`);
      await fetchGroups(accountId);
      return res.data.result;
    } catch (err) {
      console.error('Failed to disperse group:', err);
      return null;
    } finally {
      actionLoading.value = false;
    }
  }

  return {
    groups, selectedGroup, members, blocked, pending,
    loading, actionLoading,
    fetchGroups, fetchGroup, fetchMembers,
    createGroup, renameGroup, updateSettings,
    addMembers, removeMembers,
    addDeputy, removeDeputy, transferOwnership,
    blockMember, unblockMember,
    fetchBlocked, fetchPending,
    getInviteLink, leaveGroup, disperseGroup,
  };
}
