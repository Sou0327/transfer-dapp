# Cardano OTC Trading System - Deployment Guide

## デプロイメント概要

このガイドでは、Cardano OTC Trading Systemの本番環境へのデプロイメント手順を詳しく説明します。

## 前提条件

### システム要件

- **OS**: Ubuntu 20.04 LTS 以上 / CentOS 8 以上 / Docker対応OS
- **RAM**: 8GB以上推奨（最小4GB）
- **Storage**: 100GB以上のSSD
- **CPU**: 4コア以上推奨
- **Network**: 安定したインターネット接続

### 必要なソフトウェア

```bash
# Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Git
sudo apt-get update && sudo apt-get install -y git

# OpenSSL (証明書生成用)
sudo apt-get install -y openssl

# Curl (ヘルスチェック用)
sudo apt-get install -y curl
```

## 事前準備

### 1. DNS設定

以下のDNSレコードを設定：

```
A Record: your-domain.com       -> [Server IP]
A Record: www.your-domain.com   -> [Server IP]
A Record: monitor.your-domain.com -> [Server IP]
```

### 2. ファイアウォール設定

```bash
# HTTP/HTTPS ポートを開放
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# SSH（必要に応じて）
sudo ufw allow 22/tcp

# ファイアウォール有効化
sudo ufw enable
```

### 3. ユーザー設定

```bash
# デプロイ用ユーザー作成
sudo useradd -m -s /bin/bash otc-deploy
sudo usermod -aG docker otc-deploy

# SSH キー設定（推奨）
sudo -u otc-deploy ssh-keygen -t rsa -b 4096
```

## デプロイメント手順

### Step 1: リポジトリクローン

```bash
# デプロイユーザーでログイン
sudo su - otc-deploy

# リポジトリクローン
git clone <repository-url> cardano-otc-system
cd cardano-otc-system
```

### Step 2: 環境設定

```bash
# 環境変数ファイルのコピー
cp .env.production.final .env.production

# 環境変数の編集
nano .env.production
```

**重要な設定項目:**

```bash
# 基本設定
DOMAIN=your-domain.com
NODE_ENV=production

# セキュリティ（必ず変更）
JWT_SECRET=your-unique-jwt-secret-here
ENCRYPTION_KEY=your-unique-encryption-key-here
SESSION_SECRET=your-unique-session-secret-here

# データベース（必ず変更）
DATABASE_PASSWORD=your-secure-database-password
REDIS_PASSWORD=your-secure-redis-password

# Cardano設定
BLOCKFROST_API_KEY=your-blockfrost-mainnet-api-key
CARDANO_NETWORK=mainnet

# 監視設定
GRAFANA_ADMIN_PASSWORD=your-grafana-admin-password

# 通知設定
SLACK_WEBHOOK_URL=your-slack-webhook-url
ALERT_EMAIL=your-alert-email@domain.com
```

### Step 3: SSL証明書設定

#### Let's Encrypt証明書（推奨）

```bash
# 自動SSL設定
./scripts/setup-ssl.sh --domain your-domain.com --letsencrypt

# ステージング環境でテスト
./scripts/setup-ssl.sh --domain your-domain.com --letsencrypt --staging
```

#### 自己署名証明書（開発・テスト用）

```bash
./scripts/setup-ssl.sh --self-signed
```

### Step 4: 本番デプロイ実行

#### フルデプロイ

```bash
# 標準デプロイ（推奨）
./scripts/deploy.sh --domain your-domain.com

# 詳細ログ出力
VERBOSE=true ./scripts/deploy.sh --domain your-domain.com
```

#### カスタマイズデプロイ

```bash
# テストスキップ（高速デプロイ）
./scripts/deploy.sh --skip-tests --domain your-domain.com

# バックアップスキップ（初回デプロイ時）
./scripts/deploy.sh --skip-backup --domain your-domain.com

# 監視なし（軽量デプロイ）
./scripts/deploy.sh --no-monitoring --domain your-domain.com

# ドライラン（実際の変更なし）
./scripts/deploy.sh --dry-run --domain your-domain.com
```

## デプロイ後の確認

### 1. サービス状態確認

```bash
# すべてのサービス状態確認
docker-compose -f docker-compose.production.yml ps

# アプリケーションログ確認
docker-compose -f docker-compose.production.yml logs app

# データベース接続確認
docker-compose -f docker-compose.production.yml exec postgres psql -U otc_user -d otc_system -c "SELECT version();"
```

### 2. ヘルスチェック

```bash
# アプリケーションヘルスチェック
curl -f https://your-domain.com/health

# API エンドポイント確認
curl -f https://your-domain.com/api/status

# SSL証明書確認
openssl s_client -connect your-domain.com:443 -servername your-domain.com < /dev/null
```

### 3. 監視ダッシュボード確認

- **Grafana**: `https://monitor.your-domain.com/grafana`
  - ユーザー: `admin`
  - パスワード: `${GRAFANA_ADMIN_PASSWORD}`

- **Prometheus**: `https://monitor.your-domain.com/prometheus`
- **AlertManager**: `https://monitor.your-domain.com/alertmanager`

## 監視・アラート設定

### 1. Slack通知設定

```bash
# Slackワークスペースでウェブフックを作成
# 環境変数に設定
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### 2. メール通知設定

```bash
# SMTP設定
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password

# 通知先メールアドレス
CRITICAL_EMAIL=critical@your-domain.com
WARNING_EMAIL=warnings@your-domain.com
SECURITY_EMAIL=security@your-domain.com
```

### 3. カスタムアラート追加

Prometheus アラートルールを編集：

```bash
# アラートルール編集
nano monitoring/prometheus/alert_rules.yml

# 設定反映
docker-compose -f docker-compose.monitoring.yml restart prometheus
```

## バックアップ・復旧

### 1. 自動バックアップ設定

```bash
# バックアップスケジュール確認
crontab -l

# 手動バックアップテスト
./scripts/backup.sh --once

# バックアップ復元テスト
TEST_RESTORE=true ./scripts/backup.sh --once
```

### 2. バックアップファイル管理

```bash
# バックアップファイル一覧
ls -la /backups/

# 古いバックアップ削除
./scripts/backup.sh --cleanup-only

# バックアップレポート生成
./scripts/backup.sh --report-only
```

### 3. 災害復旧手順

```bash
# 1. 新しいサーバーにシステム復旧
# 2. 最新バックアップから復元
gunzip -c /backups/otc_backup_YYYYMMDD_HHMMSS.sql.gz | \
docker-compose -f docker-compose.production.yml exec -T postgres \
psql -U otc_user -d otc_system

# 3. SSL証明書復元
cp /backups/ssl/* ./ssl/

# 4. 設定ファイル復元
cp /backups/.env.production ./

# 5. サービス再起動
./scripts/deploy.sh --domain your-domain.com
```

## アップデート手順

### 1. 定期アップデート

```bash
# 最新コードを取得
git pull origin main

# アップデート実行
./scripts/deploy.sh --domain your-domain.com

# 旧バージョンのイメージ削除
docker image prune -f
```

### 2. 重要なアップデート

```bash
# バックアップ作成
./scripts/backup.sh --once

# メンテナンスモード有効化
MAINTENANCE_MODE=true ./scripts/deploy.sh --domain your-domain.com

# アップデート実行
git pull origin main
./scripts/deploy.sh --domain your-domain.com

# 動作確認後、メンテナンスモード解除
MAINTENANCE_MODE=false ./scripts/deploy.sh --domain your-domain.com
```

## セキュリティ設定

### 1. SSL/TLS強化

```bash
# SSL設定確認
./scripts/setup-ssl.sh --verify

# 証明書自動更新設定確認
crontab -l | grep renew-ssl

# セキュリティヘッダー確認
curl -I https://your-domain.com
```

### 2. アクセス制御

```bash
# IP制限設定（nginx設定で）
nano nginx/conf.d/production.conf

# 管理画面アクセス制限
# allow 192.168.1.0/24;  # 社内ネットワーク
# deny all;

# 設定反映
docker-compose -f docker-compose.production.yml restart nginx
```

### 3. セキュリティ監査

```bash
# セキュリティログ確認
docker-compose -f docker-compose.production.yml logs app | grep security

# 不正アクセス試行確認
docker-compose -f docker-compose.production.yml logs nginx | grep -E "(40[0-9]|50[0-9])"

# SSL証明書有効期限確認
openssl x509 -in ssl/fullchain.pem -noout -dates
```

## トラブルシューティング

### 1. 一般的な問題

#### アプリケーションが起動しない

```bash
# 詳細ログ確認
docker-compose -f docker-compose.production.yml logs --tail=100 app

# データベース接続確認
docker-compose -f docker-compose.production.yml exec postgres pg_isready

# ポート使用状況確認
sudo netstat -tlnp | grep -E "(80|443|4000|5432|6379)"
```

#### SSL証明書エラー

```bash
# 証明書確認
openssl x509 -in ssl/fullchain.pem -text -noout

# Let's Encrypt更新
sudo certbot renew --dry-run

# 証明書権限確認
ls -la ssl/
```

#### パフォーマンス問題

```bash
# リソース使用状況
docker stats

# データベースパフォーマンス
docker-compose -f docker-compose.production.yml exec postgres \
psql -U otc_user -d otc_system -c "
SELECT schemaname,tablename,attname,n_distinct,correlation 
FROM pg_stats 
WHERE schemaname = 'public';"
```

### 2. ログ分析

```bash
# エラーログ抽出
docker-compose logs app 2>&1 | grep -i error

# アクセスログ分析
docker-compose logs nginx | grep -E "GET|POST" | tail -100

# セキュリティイベント確認
grep -r "security_event" /var/log/otc-app/
```

### 3. 緊急対応

#### サービス停止

```bash
# 緊急停止
docker-compose -f docker-compose.production.yml down

# データベースのみ停止
docker-compose -f docker-compose.production.yml stop postgres
```

#### メンテナンスモード

```bash
# メンテナンスページ表示
echo "MAINTENANCE_MODE=true" >> .env.production
docker-compose -f docker-compose.production.yml restart app
```

#### ロールバック

```bash
# 前のコミットに戻す
git log --oneline -10
git checkout <previous-commit-hash>
./scripts/deploy.sh --domain your-domain.com
```

## パフォーマンス最適化

### 1. データベース最適化

```bash
# インデックス確認
docker-compose exec postgres psql -U otc_user -d otc_system -c "
SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch 
FROM pg_stat_user_indexes 
ORDER BY idx_tup_read DESC;"

# 自動バキューム設定確認
docker-compose exec postgres psql -U otc_user -d otc_system -c "
SHOW autovacuum;"
```

### 2. キャッシュ最適化

```bash
# Redis使用状況確認
docker-compose exec redis redis-cli info memory

# キャッシュ効率確認
docker-compose exec redis redis-cli info stats
```

### 3. Nginx最適化

```bash
# アクセスログ分析
docker-compose logs nginx | \
awk '{print $7}' | sort | uniq -c | sort -rn | head -20

# キャッシュ状況確認
docker exec -it otc-nginx ls -la /var/cache/nginx/
```

## 運用チェックリスト

### 日次チェック

- [ ] Grafanaダッシュボードで健康状態確認
- [ ] アラート通知確認
- [ ] バックアップ完了確認
- [ ] SSL証明書有効期限確認（30日前に警告）
- [ ] ディスク使用量確認

### 週次チェック

- [ ] システムアップデート確認
- [ ] セキュリティログ監査
- [ ] パフォーマンス分析
- [ ] 不要なDockerイメージ削除
- [ ] ログファイルローテーション確認

### 月次チェック

- [ ] セキュリティスキャン実行
- [ ] 災害復旧テスト
- [ ] パスワード・API キー更新
- [ ] 容量計画見直し
- [ ] 監視設定見直し

---

このデプロイメントガイドに従って、安全で効率的なCardano OTC Trading Systemの運用を実現してください。質問や問題がある場合は、プロジェクトのIssue Trackerまでお気軽にお問い合わせください。