/**
 * Main Router Component
 * Handles routing for both OTC system and legacy transfer app
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminApp } from './components/admin/AdminApp';
import { SigningPage } from './components/sign/SigningPage';
import App from './App'; // Legacy transfer app

export const Router: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Legacy transfer app - keep existing functionality */}
        <Route path="/transfer" element={<App />} />
        
        {/* OTC Admin System */}
        <Route path="/admin/*" element={<AdminApp />} />
        
        {/* OTC Signing Interface */}
        <Route path="/sign" element={<SigningPage />} />
        
        {/* Default redirect to admin app */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        
        {/* Catch-all for unknown routes */}
        <Route path="*" element={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">404 - ページが見つかりません</h1>
              <p className="text-gray-600 mb-6">
                お探しのページは存在しないか、移動した可能性があります。
              </p>
              <div className="space-x-4">
                <a 
                  href="/transfer" 
                  className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700"
                >
                  送金アプリ
                </a>
                <a 
                  href="/admin" 
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                >
                  管理画面
                </a>
              </div>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
};