/**
 * Admin Route Component - Lazy loaded
 */

import React from 'react';
import { Card, CardHeader, CardBody, Alert } from '../../common';
import { usePerformanceMonitor } from '../../../lib/performance/reactOptimization';

interface AdminRouteProps {
  className?: string;
  disabled?: boolean;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ className, disabled }) => {
  // Performance monitoring for lazy loaded component
  usePerformanceMonitor('AdminRoute');

  return (
    <div className={`space-y-6 ${className || ''} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">管理者パネル</h2>
        <div className="text-sm text-gray-500">
          Lazy loaded • Admin Only
        </div>
      </div>

      <Alert variant="info">
        管理者機能は開発中です。このコンポーネントは遅延読み込みされています。
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">システム監視</h3>
          </CardHeader>
          <CardBody>
            <p className="text-gray-600">システムの健全性とパフォーマンスを監視</p>
            <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors">
              監視開始
            </button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">ユーザー管理</h3>
          </CardHeader>
          <CardBody>
            <p className="text-gray-600">アクティブユーザーとセッション管理</p>
            <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors">
              管理画面
            </button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">セキュリティ</h3>
          </CardHeader>
          <CardBody>
            <p className="text-gray-600">セキュリティ監査とログ分析</p>
            <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors">
              監査ログ
            </button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default AdminRoute;