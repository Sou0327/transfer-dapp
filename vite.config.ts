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
          manualChunks: {
            // React関連を別チャンクに分離
            react: ['react', 'react-dom'],
            // Cardano Serialization Libraryを別チャンクに分離
            cardano: ['@emurgo/cardano-serialization-lib-browser'],
          },
          // チャンクファイル名の設定
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
      },
      
      // 出力設定
      outDir: 'dist',
      assetsDir: 'assets',
      
      // 圧縮設定
      minify: 'esbuild',
      
      // ファイルサイズ警告の閾値（KB）
      chunkSizeWarningLimit: 1000,
      
      // CSSコード分割
      cssCodeSplit: true,
      
      // プリロード無効化（セキュリティ向上）
      modulePreload: false,
    },
    
    // 開発サーバー設定
    server: {
      port: 3000,
      open: false,
      cors: true,
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
      setupFiles: ['./src/tests/setup.ts'],
      // テストファイルのパターン
      include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
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
