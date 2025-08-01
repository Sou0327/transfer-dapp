/**
 * Admin App - Main Application for OTC System Administration
 * Integrates all admin components: Dashboard, Requests, Transactions, Monitoring, Settings
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useAdminAuth, createAuthenticatedFetch } from '../../hooks/useAdminAuth';
import { useWebSocket } from '../../lib/websocket';
import { AdminLogin } from './AdminLogin';
import { Dashboard } from './Dashboard';
import { RequestsManagement } from './RequestsManagement';
// SecurityDashboard と SystemSettings は段階的リリースのため一時的に非表示
// import { SecurityDashboard } from './SecurityDashboard';
// import { SystemSettings } from './SystemSettings';
import { 
  OTCRequest, 
  CreateRequestRequest, 
  CreateRequestResponse,
  RequestStatus,
  LoginCredentials
} from '../../types/otc/index';

// 段階的リリース: 基本機能に集中するため security と settings は一時的に非表示
type AdminTab = 'dashboard' | 'requests'; // | 'transactions' | 'security' | 'settings';

export const AdminApp: React.FC = () => {
  const { session, loading: authLoading, login, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [requests, setRequests] = useState<OTCRequest[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // WebSocket for real-time admin updates
  const { isConnected: wsConnected, isAuthenticated: wsAuthenticated, subscribe, unsubscribe } = useWebSocket({
    onStatusUpdate: (update) => {
      console.log('🔥 管理者向けステータス更新受信:', update);
      console.log('🔥 現在のリクエスト数:', requests.length);
      
      // リクエストリストを更新
      setRequests(prev => {
        const updatedList = prev.map(req => 
          req.id === update.request_id 
            ? { ...req, status: update.status, updated_at: update.timestamp }
            : req
        );
        console.log('🔥 更新後のリクエスト:', updatedList);
        return updatedList;
      });
    },
    onConnect: () => {
      console.log('🔥 管理者WebSocket接続成功');
    },
    onDisconnect: () => {
      console.log('🔥 管理者WebSocket切断');
    }
  });

  // Handle login
  const handleLogin = useCallback(async (credentials: LoginCredentials) => {
    try {
      setLoginLoading(true);
      setLoginError(null);
      
      await login(credentials);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ログインに失敗しました';
      setLoginError(errorMessage);
      throw error; // Re-throw to let the login component handle it
    } finally {
      setLoginLoading(false);
    }
  }, [login]);

  // Fetch requests data
  const fetchRequests = useCallback(async () => {
    if (!session) return;

    try {
      // setRequestsLoading(true); // Removed since variable was removed
      
      // 実際のAPIからデータを取得

      const authFetch = createAuthenticatedFetch();
      const response = await authFetch('/api/ada/requests');
      const data = await response.json();
      
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      // setRequestsLoading(false); // Removed since variable was removed
    }
  }, [session]);

  // Create new request
  const handleCreateRequest = useCallback(async (requestData: CreateRequestRequest): Promise<CreateRequestResponse> => {
    // 実際のAPIで請求を作成

    const authFetch = createAuthenticatedFetch();
    
    const response = await authFetch('/api/ada/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '請求作成に失敗しました');
    }

    const result = await response.json();
    
    // Refresh requests list
    await fetchRequests();
    
    return result;
  }, [fetchRequests]);

  // Update request status
  const handleUpdateStatus = useCallback(async (id: string, status: RequestStatus): Promise<void> => {
    // 開発環境ではローカル状態を更新
    if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
      setRequests(prev => prev.map(req => 
        req.id === id 
          ? { ...req, status, updated_at: new Date().toISOString() }
          : req
      ));
      return;
    }

    const authFetch = createAuthenticatedFetch();
    
    const response = await authFetch(`/api/ada/requests/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'ステータス更新に失敗しました');
    }

    // Refresh requests list
    await fetchRequests();
  }, [fetchRequests]);

  // Generate new signing link
  const handleGenerateLink = useCallback(async (id: string): Promise<string> => {
    // 実際のAPIでリンクを生成

    const authFetch = createAuthenticatedFetch();
    
    const response = await authFetch(`/api/ada/requests/${id}/regenerate-link`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'リンク生成に失敗しました');
    }

    const result = await response.json();
    
    // Refresh requests list
    await fetchRequests();
    
    return result.signUrl;
  }, [fetchRequests]);

  // Handle tab change
  const handleTabChange = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    
    // Load data when switching to requests tab
    if (tab === 'requests' && requests.length === 0) {
      fetchRequests();
    }
  }, [requests.length, fetchRequests]);

  // Initialize requests data when authenticated
  useEffect(() => {
    if (session && activeTab === 'requests') {
      fetchRequests();
    }
  }, [session, activeTab, fetchRequests]);

  // Initialize WebSocket connection for admin when authenticated  
  useEffect(() => {
    console.log('🔥 AdminApp WebSocket状態:');
    console.log('  session:', !!session);
    console.log('  wsConnected:', wsConnected);
    console.log('  wsAuthenticated:', wsAuthenticated);
    console.log('  email:', session?.email);
    
    if (session && wsConnected) {
      // WebSocket接続成功時のログ
      console.log('🔥 管理者WebSocket接続成功 - adminルームに参加');
    }
  }, [session, wsConnected, wsAuthenticated]);

  // Show loading state during authentication check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">認証状態を確認中...</p>
        </div>
      </div>

    );
  }

  // Show login form if not authenticated
  if (!session) {
    return (
      <AdminLogin 
        onLogin={handleLogin}
        loading={loginLoading}
        error={loginError}
      />
    );
  }

  // Main admin interface
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">₳ OTC管理システム</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">管理者: {session.email}</span>
              <button
                onClick={() => logout()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center space-x-32">
            {[
              { id: 'dashboard' as const, label: 'ダッシュボード' },
              { id: 'requests' as const, label: '請求管理' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`py-4 px-6 text-sm font-medium transition-colors duration-200 focus:outline-none ${activeTab === tab.id ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-800 hover:border-b-2 hover:border-gray-300'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'requests' && (
            <RequestsManagement
              requests={requests}
              onCreateRequest={handleCreateRequest}
              onUpdateStatus={handleUpdateStatus}
              onGenerateLink={handleGenerateLink}
            />
          )}

          {/* 段階的リリース: セキュリティとシステム設定は一時的に非表示 */}
          {/* {activeTab === 'security' && <SecurityDashboard />} */}
          {/* {activeTab === 'settings' && <SystemSettings />} */}
        </div>
      </main>
    </div>
  );
};

export default AdminApp;