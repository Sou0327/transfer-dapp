# タスク完了時のチェックリスト

## 必須実行コマンド
1. **型チェック**: `npm run typecheck`
2. **リント**: `npm run lint`
3. **テスト**: `npm run test:run`
4. **ビルド**: `npm run build`

## コード品質チェック
- [ ] TypeScriptエラーがない
- [ ] ESLintエラー・警告がない
- [ ] テストが全て通る
- [ ] ビルドが成功する
- [ ] コンソールエラーがない

## パフォーマンス確認
- [ ] React DevTools Profilerで確認
- [ ] Bundle analyzer結果確認
- [ ] Performance監視ログ確認
- [ ] メモリリーク検査

## セキュリティ確認
- [ ] 入力値サニタイゼーション
- [ ] XSS対策確認
- [ ] API認証確認
- [ ] 監査ログ出力

## デプロイ前チェック
- [ ] 環境変数設定確認
- [ ] プロダクションビルド動作確認
- [ ] Docker compose動作確認
- [ ] SSL/TLS設定確認

## ドキュメント更新
- [ ] コンポーネントJSDoc更新
- [ ] README.md更新（必要に応じて）
- [ ] ARCHITECTURE.md更新（必要に応じて）
- [ ] 変更ログ記録