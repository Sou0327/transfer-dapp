import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 環境変数を読み込み
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react(), wasm(), topLevelAwait()],
    
    // パス解決設定
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    
    // ビルド設定
    build: {
      // ソースマップの生成（環境変数で制御）
      sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
      
      // チャンク分割設定
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Node modulesの動的チャンク分割
            if (id.includes('node_modules')) {
              // React関連
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react';
              }
              
              // Cardano関連ライブラリ（最も大きなライブラリ）
              if (id.includes('@emurgo/cardano-serialization-lib-browser')) {
                return 'cardano-wasm';
              }
              
              // Cardano peer connect関連
              if (id.includes('@fabianbormann/cardano-peer-connect') || 
                  id.includes('@fabianbormann/meerkat')) {
                return 'cardano-peer-connect';
              }
              
              // ルーティング関連
              if (id.includes('react-router-dom')) {
                return 'router';
              }
              
              // 状態管理関連
              if (id.includes('zustand') || id.includes('immer')) {
                return 'store';
              }
              
              // WebSocket関連
              if (id.includes('socket.io-client') || id.includes('ws')) {
                return 'websocket';
              }
              
              // 暗号化関連
              if (id.includes('crypto') || id.includes('bcrypt')) {
                return 'crypto';
              }
              
              // ユーティリティライブラリ（軽量なもの）
              if (id.includes('uuid') || id.includes('qrcode')) {
                return 'utils';
              }
              
              // バリデーション関連（zodが含まれているかチェック）
              if (id.includes('zod')) {
                return 'validation';
              }
              
              // その他のnode_modulesは共通チャンクに
              return 'vendor';
            }
            
            // アプリケーションコードの分割
            if (id.includes('/src/components/')) {
              return 'components';
            }
            
            if (id.includes('/src/utils/') || id.includes('/src/lib/')) {
              return 'app-utils';
            }
            
            if (id.includes('/src/stores/') || id.includes('/src/context/')) {
              return 'app-store';
            }
          },
          // チャンクファイル名の設定
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
        // 🔐 警告の制御（セキュリティを考慮）
        onwarn(warning, warn) {
          // eval使用警告を特定の信頼できるライブラリでは抑制
          if (warning.code === 'EVAL' && 
              warning.id && 
              (warning.id.includes('cardano-peer-connect') || 
               warning.id.includes('@fabianbormann') ||
               warning.id.includes('node_modules'))) {
            // 信頼できるサードパーティライブラリのeval使用は許可
            console.warn(`⚠️ Suppressed eval warning in: ${warning.id}`);
            return;
          }
          
          // 循環依存警告を抑制（開発時のみ）
          if (warning.code === 'CIRCULAR_DEPENDENCY' && env.NODE_ENV === 'development') {
            return;
          }
          
          // その他の警告は通常通り表示
          warn(warning);
        },
      },
      
      // 出力設定
      outDir: 'dist',
      assetsDir: 'assets',
      
      // 圧縮設定
      minify: 'esbuild',
      
      // セキュリティ設定 - eval使用警告の適切な処理
      target: 'es2020',
      
      // ファイルサイズ警告の閾値（KB）- Cardano WASMライブラリを考慮
      chunkSizeWarningLimit: mode === 'development' ? 2000 : 1200,
      
      // CSSコード分割
      cssCodeSplit: true,
      
      // プリロード設定（Docker環境対応）
      modulePreload: {
        polyfill: true,
        resolveDependencies: () => [],
      },
    },
    
    // 開発サーバー設定
    server: {
      port: 4000, // 現在の4000ポートに合わせる
      open: false,
      cors: true,
      // APIプロキシ設定 - /api/* リクエストをバックエンドサーバーに転送
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        // WebSocketプロキシ設定
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
        // Socket.io プロキシ設定（念のため）
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
      // HTTPS設定（環境変数で制御）
      https: env.VITE_ENABLE_HTTPS === 'true' ? {} : false,
      // セキュリティヘッダー設定
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      },
    },
    
    // プレビューサーバー設定
    preview: {
      port: 3000,
      open: false,
      cors: true,
    },
    
    // テスト設定
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // テストファイルのパターン
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
      // アライアス設定
      alias: {
        '@emurgo/cardano-serialization-lib-browser': new URL('./src/__mocks__/@emurgo/cardano-serialization-lib-browser.ts', import.meta.url).pathname,
      },
      // 依存関係設定  
      server: {
        deps: {
          // WASMモジュールを外部として除外
          external: ['@emurgo/cardano-serialization-lib-browser'],
        },
      },
      // カバレッジ設定
      coverage: {
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'src/tests/setup.ts',
          '**/*.d.ts',
          'dist/',
        ],
      },
    },
    
    // グローバル定義
    define: {
      global: 'globalThis',
      // 環境変数をクライアントサイドで利用可能にする
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
    
    // 最適化設定
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'buffer', // Buffer polyfill
      ],
      exclude: [
        '@emurgo/cardano-serialization-lib-browser', // WASMなので除外
      ],
    },
    
    // CSS設定
    css: {
      // PostCSS設定は postcss.config.js で管理
      postcss: {},
      
      // CSS圧縮設定
      devSourcemap: mode === 'development',
    },
    
    // 環境変数のプレフィックス設定
    envPrefix: ['VITE_'],
    
    // ログレベル設定
    logLevel: mode === 'development' ? 'info' : 'warn',
  }
})
