/**
 * Admin App - Main Application for OTC System Administration
 * Integrates all admin components: Dashboard, Requests, Transactions, Monitoring, Settings
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useAdminAuth, createAuthenticatedFetch } from '../../hooks/useAdminAuth';
import { useWebSocket } from '../../lib/websocket';
import { AdminLogin } from './AdminLogin';

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

// 段階的リリース: 基本機能に集中するため dashboard, security と settings は一時的に非表示
// | 'transactions' | 'security' | 'settings';

export const AdminApp: React.FC = () => {
  const { session, loading: authLoading, login, logout } = useAdminAuth();

  const [requests, setRequests] = useState<OTCRequest[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // WebSocket for real-time admin updates
  const { isConnected: wsConnected, isAuthenticated: wsAuthenticated } = useWebSocket({
    onStatusUpdate: (update) => {
      console.log('🔥 管理者向けステータス更新受信:', update);
      console.log('🔥 現在のリクエスト数:', requests.length);

      // リクエストリストを即座に更新
      setRequests(prev => {
        const updatedList = prev.map(req =>
          req.id === update.request_id
            ? { ...req, status: update.status as RequestStatus, updated_at: update.timestamp }
            : req
        );
        console.log('🔥 更新後のリクエスト:', updatedList);

        // ローカルストレージのバックアップも更新
        try {
          localStorage.setItem('otc_admin_requests_backup', JSON.stringify(updatedList));
          console.log('💾 WebSocket更新後のバックアップ保存完了');
        } catch (error) {
          console.warn('⚠️ WebSocket更新後のバックアップ保存に失敗:', error);
        }

        return updatedList;
      });

      // サーバーから最新データを再取得（5秒後に実行して競合を避ける）
      setTimeout(() => {
        console.log('🔄 WebSocket更新後のリクエスト再取得...');
        fetchRequests();
      }, 2000);
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

      // 環境に応じてAPIベースURLを設定
      const apiBaseUrl = import.meta.env.PROD ?
        `${window.location.protocol}//${window.location.host}` :
        '';
      const apiUrl = `${apiBaseUrl}/api/ada/requests`;

      // 本番環境対応: 直接fetchを使用
      const token = localStorage.getItem('otc_admin_token');
      const headers: Record<string, string> = {};

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      console.log('🔍 リクエスト一覧取得:', {
        url: apiUrl,
        environment: import.meta.env.PROD ? 'production' : 'development',
        hasToken: !!token
      });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers
      });

      console.log('📡 API Response status:', response.status);
      console.log('📡 API Response ok:', response.ok);

      if (!response.ok) {
        console.error('❌ API Error:', response.status, response.statusText);
        return;
      }

      const data = await response.json();
      console.log('📋 API Response data:', data);
      console.log('📊 Requests found:', data.requests?.length || 0);

      if (data.requests && data.requests.length > 0) {
        console.log('✅ Setting requests:', data.requests);
        setRequests(data.requests);

        // ローカルストレージにバックアップ保存
        try {
          localStorage.setItem('otc_admin_requests_backup', JSON.stringify(data.requests));
          console.log('💾 リクエストデータをローカルストレージにバックアップ');
        } catch (error) {
          console.warn('⚠️ ローカルストレージへの保存に失敗:', error);
        }
      } else {
        console.log('⚠️ No requests found from server');

        // サーバーから取得できない場合、ローカルストレージから復元を試行
        try {
          const backup = localStorage.getItem('otc_admin_requests_backup');
          if (backup) {
            const backupRequests = JSON.parse(backup);
            console.log('🔄 ローカルストレージからリクエストを復元:', backupRequests.length);
            setRequests(backupRequests);
          } else {
            console.log('📭 ローカルストレージにもバックアップなし');
            setRequests([]);
          }
        } catch (error) {
          console.error('❌ ローカルストレージからの復元に失敗:', error);
          setRequests([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);

      // サーバーエラー時はローカルバックアップから復元を試行
      if (requests.length === 0) {
        try {
          const backup = localStorage.getItem('otc_admin_requests_backup');
          if (backup) {
            const backupRequests = JSON.parse(backup);
            console.log('🔄 サーバーエラー時のローカルバックアップ復元:', backupRequests.length);
            setRequests(backupRequests);
          }
        } catch (backupError) {
          console.error('❌ ローカルバックアップ復元も失敗:', backupError);
        }
      }
    } finally {
      // setRequestsLoading(false); // Removed since variable was removed
    }
  }, [session, requests.length]);

  // Create new request
  const handleCreateRequest = useCallback(async (requestData: CreateRequestRequest): Promise<CreateRequestResponse> => {
    // 環境に応じてAPIベースURLを設定
    const apiBaseUrl = import.meta.env.PROD ?
      `${window.location.protocol}//${window.location.host}` :
      '';
    const apiUrl = `${apiBaseUrl}/api/ada/requests`;

    console.log('🔍 リクエスト作成開始:', {
      requestData,
      url: apiUrl,
      method: 'POST',
      environment: import.meta.env.PROD ? 'production' : 'development',
      baseUrl: apiBaseUrl
    });

    // 本番環境対応: 直接fetchを使用して認証問題を回避
    const token = localStorage.getItem('otc_admin_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // トークンがある場合のみAuthorizationヘッダーを追加
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestData),
    });

    console.log('🔍 リクエスト作成レスポンス:', {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      url: response.url
    });

    if (!response.ok) {
      // レスポンスの内容をテキストとして取得してデバッグ
      const responseText = await response.text();
      console.error('🔍 リクエスト作成エラーレスポンス:', {
        status: response.status,
        statusText: response.statusText,
        responseText: responseText.substring(0, 500) // 最初の500文字のみ表示
      });

      // JSONとして解析を試行
      let errorMessage = '請求作成に失敗しました';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        // JSONでない場合（HTMLページなど）
        if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
          errorMessage = 'APIエンドポイントが見つかりません（HTMLページが返されました）';
        } else {
          errorMessage = `サーバーエラー: ${response.status} ${response.statusText}`;
        }
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('✅ リクエスト作成成功:', result);

    // 即座にローカルリストに新しいリクエストを追加
    if (result.requestId) {
      const newRequest: OTCRequest = {
        id: result.requestId,
        currency: requestData.currency,
        amount_mode: requestData.amount_mode,
        amount_or_rule_json: requestData.amount_or_rule,
        recipient: requestData.recipient,
        status: 'REQUESTED' as RequestStatus,
        created_by: session?.email || 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ttl_minutes: requestData.ttl_minutes,
        ttl_slot: Math.floor(Date.now() / 1000) + (requestData.ttl_minutes * 60),
        ttl_absolute: new Date(Date.now() + requestData.ttl_minutes * 60 * 1000).toISOString()
      };

      console.log('📝 ローカルリストに新しいリクエストを追加:', newRequest);
      setRequests(prev => {
        const updated = [newRequest, ...prev];
        console.log('📊 更新後のリクエスト数:', updated.length);

        // ローカルストレージのバックアップも更新
        try {
          localStorage.setItem('otc_admin_requests_backup', JSON.stringify(updated));
          console.log('💾 新規リクエスト作成後のバックアップ保存完了');
        } catch (error) {
          console.warn('⚠️ 新規リクエスト作成後のバックアップ保存に失敗:', error);
        }

        return updated;
      });
    }

    // サーバーから最新リストも取得（バックアップとして）
    setTimeout(() => {
      console.log('🔄 サーバーからの最新リスト取得...');
      fetchRequests();
    }, 1000);

    return result;
  }, [fetchRequests, session]);

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



  // Handle archive request
  const handleArchiveRequest = useCallback(async (id: string, archived: boolean = true): Promise<void> => {
    try {
      // 環境に応じてAPI ベースURLを設定
      const apiBaseUrl = import.meta.env.PROD ?
        `${window.location.protocol}//${window.location.host}` :
        '';
      const apiUrl = `${apiBaseUrl}/api/ada/requests/${id}/archive`;
      
      console.log('🔍 Archive request:', { id, archived, apiUrl });
      
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('otc_admin_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ archived })
      });

      if (!response.ok) {
        console.error('❌ Archive API Error:', response.status, response.statusText);
        let errorMessage = 'アーカイブ処理に失敗しました';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          const responseText = await response.text();
          console.error('❌ Archive Response Text:', responseText);
          errorMessage = `API エラー: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log(`✅ ${archived ? 'アーカイブ' : 'アーカイブ解除'}成功:`, result);

      // ローカルリストを更新
      setRequests(prev => prev.map(req =>
        req.id === id
          ? { ...req, archived, archived_at: archived ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() }
          : req
      ));

      // Refresh requests list from server
      await fetchRequests();

    } catch (error) {
      console.error('アーカイブ処理エラー:', error);
      throw error;
    }
  }, [fetchRequests]);

  const handleDeleteRequest = useCallback(async (id: string): Promise<void> => {
    try {
      // 環境に応じてAPI ベースURLを設定
      const apiBaseUrl = import.meta.env.PROD ?
        `${window.location.protocol}//${window.location.host}` :
        '';
      const apiUrl = `${apiBaseUrl}/api/ada/requests/${id}`;
      
      console.log('🔍 Delete request:', { id, apiUrl });
      
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('otc_admin_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Delete API Error:', response.status, response.statusText);
        let errorMessage = 'リクエスト削除に失敗しました';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          const responseText = await response.text();
          console.error('❌ Delete Response Text:', responseText);
          errorMessage = `API エラー: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ リクエスト削除成功:', result);

      // ローカルリストから削除
      setRequests(prev => prev.filter(req => req.id !== id));

      // Refresh requests list from server
      await fetchRequests();

    } catch (error) {
      console.error('リクエスト削除エラー:', error);
      throw error;
    }
  }, [fetchRequests]);

  // Initialize requests data when authenticated  
  useEffect(() => {
    console.log('🔍 Session effect triggered:', {
      hasSession: !!session,
      requestsLength: requests.length
    });

    if (session) {
      console.log('📋 Fetching requests due to session change...');

      // セッション開始時にまずローカルバックアップから復元
      if (requests.length === 0) {
        try {
          const backup = localStorage.getItem('otc_admin_requests_backup');
          if (backup) {
            const backupRequests = JSON.parse(backup);
            console.log('🔄 セッション開始時のローカルバックアップ復元:', backupRequests.length);
            setRequests(backupRequests);
          }
        } catch (error) {
          console.warn('⚠️ セッション開始時のバックアップ復元に失敗:', error);
        }
      }

      // その後サーバーから最新データを取得
      fetchRequests();
    }
  }, [session, fetchRequests, requests.length]);

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
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 sm:py-6 gap-3 sm:gap-0">
            <div className="flex items-center">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">₳ OTC管理システム</h1>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md border">
                <svg className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="font-medium truncate max-w-[160px] sm:max-w-none" title={session.email}>
                  {session.email}
                </span>
              </div>
              <button
                onClick={() => logout()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors shadow-sm"
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation - 一時的に非表示（復活時は下記コメントアウトを解除）
      <nav className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center space-x-8 sm:space-x-32 overflow-x-auto">
            {[
              { id: 'requests' as const, label: 'リクエスト管理' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => fetchRequests()}
                className="py-3 sm:py-4 px-4 sm:px-6 text-sm font-medium transition-colors duration-200 focus:outline-none whitespace-nowrap border-b-2 border-blue-500 text-blue-600">
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>
      */}

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-4 sm:py-6">
          <RequestsManagement
            requests={requests}
            onCreateRequest={handleCreateRequest}
            onUpdateStatus={handleUpdateStatus}
            onGenerateLink={handleGenerateLink}
            onArchiveRequest={handleArchiveRequest}
            onDeleteRequest={handleDeleteRequest}
          />

          {/* 段階的リリース: セキュリティとシステム設定は一時的に非表示 */}
          {/* {activeTab === 'security' && <SecurityDashboard />} */}
          {/* {activeTab === 'settings' && <SystemSettings />} */}
        </div>
      </main>
    </div>
  );
};

export default AdminApp;