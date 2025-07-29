/**
 * Admin App - Main Application for OTC System Administration
 * Integrates all admin components: Dashboard, Requests, Transactions, Monitoring, Settings
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useAdminAuth, createAuthenticatedFetch } from '../../hooks/useAdminAuth';
import { AdminLogin } from './AdminLogin';
import { AdminLayout } from './AdminLayout';
import { Dashboard } from './Dashboard';
import { RequestsManagement } from './RequestsManagement';
import { TransactionManagement } from './TransactionManagement';
import { MonitoringSettings } from './MonitoringSettings';
import { SystemSettings } from './SystemSettings';
import { 
  OTCRequest, 
  CreateRequestRequest, 
  CreateRequestResponse,
  RequestStatus,
  LoginCredentials
} from '../../types/otc/index';

type AdminTab = 'dashboard' | 'requests' | 'transactions' | 'monitoring' | 'settings';

export const AdminApp: React.FC = () => {
  const { session, loading: authLoading, error: authError, login, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [requests, setRequests] = useState<OTCRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
      setRequestsLoading(true);
      
      const authFetch = createAuthenticatedFetch();
      const response = await authFetch('/api/ada/requests');
      const data = await response.json();
      
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setRequestsLoading(false);
    }
  }, [session]);

  // Create new request
  const handleCreateRequest = useCallback(async (requestData: CreateRequestRequest): Promise<CreateRequestResponse> => {
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

  // Show login screen if not authenticated
  if (!session) {
    return (
      <AdminLogin
        onLogin={handleLogin}
        loading={loginLoading}
        error={loginError || authError}
      />
    );
  }

  // Render main admin interface
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
        
      case 'requests':
        return (
          <RequestsManagement
            requests={requests}
            onCreateRequest={handleCreateRequest}
            onUpdateStatus={handleUpdateStatus}
            onGenerateLink={handleGenerateLink}
          />
        );
        
      case 'transactions':
        return <TransactionManagement />;
        
      case 'monitoring':
        return <MonitoringSettings />;
        
      case 'settings':
        return <SystemSettings />;
        
      default:
        return <Dashboard />;
    }
  };

  return (
    <AdminLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {renderTabContent()}
    </AdminLayout>
  );
};