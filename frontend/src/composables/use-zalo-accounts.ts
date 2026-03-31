/**
 * Composable for Zalo account management logic:
 * - CRUD operations via REST API
 * - Real-time QR login flow via Socket.IO
 */
import { ref, onUnmounted } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';

export interface ZaloAccount {
  id: string;
  displayName: string | null;
  zaloUid: string | null;
  status: string;
  liveStatus?: string;
  phone: string | null;
  proxyUrl: string | null;
  hasProxy: boolean;
  sessionData: any;
  ownerUserId: string;
  createdAt: string;
}

export function useZaloAccounts() {
  const accounts = ref<ZaloAccount[]>([]);
  const loading = ref(false);
  const adding = ref(false);
  const deleting = ref(false);

  // QR dialog state
  const showQRDialog = ref(false);
  const qrImage = ref('');
  const qrScanned = ref(false);
  const scannedName = ref('');
  const qrError = ref('');
  const currentLoginAccountId = ref('');

  let socket: Socket | null = null;

  function statusColor(status: string) {
    switch (status) {
      case 'connected': return 'success';
      case 'qr_pending': case 'connecting': return 'warning';
      default: return 'error';
    }
  }

  function statusText(status: string) {
    switch (status) {
      case 'connected': return 'Đã kết nối';
      case 'qr_pending': return 'Chờ QR';
      case 'connecting': return 'Đang kết nối...';
      default: return 'Ngắt kết nối';
    }
  }

  async function fetchAccounts() {
    loading.value = true;
    try {
      const res = await api.get('/zalo-accounts');
      accounts.value = res.data;
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      loading.value = false;
    }
  }

  async function addAccount(displayName: string, proxyUrl?: string) {
    adding.value = true;
    try {
      await api.post('/zalo-accounts', {
        displayName: displayName || undefined,
        proxyUrl: proxyUrl || undefined,
      });
      await fetchAccounts();
      return true;
    } catch (err: any) {
      console.error('Failed to add account:', err);
      return false;
    } finally {
      adding.value = false;
    }
  }

  async function loginAccount(accountId: string) {
    currentLoginAccountId.value = accountId;
    qrImage.value = '';
    qrScanned.value = false;
    scannedName.value = '';
    qrError.value = '';
    showQRDialog.value = true;
    socket?.emit('zalo:subscribe', { accountId });
    try {
      await api.post(`/zalo-accounts/${accountId}/login`);
    } catch (err: any) {
      qrError.value = err.response?.data?.error || 'Không thể bắt đầu đăng nhập';
    }
  }

  async function reconnectAccount(accountId: string) {
    try {
      await api.post(`/zalo-accounts/${accountId}/reconnect`);
      await fetchAccounts();
    } catch (err: any) {
      console.error('Reconnect failed:', err);
    }
  }

  async function deleteAccount(account: ZaloAccount) {
    deleting.value = true;
    try {
      await api.delete(`/zalo-accounts/${account.id}`);
      await fetchAccounts();
      return true;
    } catch (err: any) {
      console.error('Delete failed:', err);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function cancelQR() {
    showQRDialog.value = false;
    socket?.emit('zalo:unsubscribe', { accountId: currentLoginAccountId.value });
  }

  async function updateProxy(accountId: string, proxyUrl: string | null) {
    try {
      await api.put(`/zalo-accounts/${accountId}/proxy`, { proxyUrl });
      await fetchAccounts();
      return true;
    } catch (err: any) {
      console.error('Failed to update proxy:', err);
      return false;
    }
  }

  function setupSocket() {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('zalo:qr', (data: { accountId: string; qrImage: string }) => {
      if (data.accountId === currentLoginAccountId.value) qrImage.value = data.qrImage;
    });

    socket.on('zalo:scanned', (data: { accountId: string; displayName: string }) => {
      if (data.accountId === currentLoginAccountId.value) {
        qrImage.value = '';
        qrScanned.value = true;
        scannedName.value = data.displayName;
      }
    });

    socket.on('zalo:connected', (_data: { accountId: string }) => {
      showQRDialog.value = false;
      fetchAccounts();
    });

    socket.on('zalo:disconnected', (_data: { accountId: string }) => { fetchAccounts(); });

    socket.on('zalo:error', (data: { accountId: string; error: string }) => {
      if (data.accountId === currentLoginAccountId.value) qrError.value = data.error;
      fetchAccounts();
    });

    socket.on('zalo:qr-expired', (data: { accountId: string }) => {
      if (data.accountId === currentLoginAccountId.value) {
        qrImage.value = '';
        qrError.value = 'QR đã hết hạn, đang tạo lại...';
      }
    });

    socket.on('zalo:reconnect-failed', (_data: { accountId: string }) => { fetchAccounts(); });
  }

  onUnmounted(() => { socket?.disconnect(); });

  return {
    accounts, loading, adding, deleting,
    showQRDialog, qrImage, qrScanned, scannedName, qrError,
    statusColor, statusText,
    fetchAccounts, addAccount, loginAccount, reconnectAccount, deleteAccount,
    updateProxy, cancelQR, setupSocket,
  };
}
