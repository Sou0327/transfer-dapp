# transfer-dapp URL形式不一致の修正

## 問題の特定
「不明な金額モードです」エラーの根本原因は、**ローカル環境とVercel環境でURL形式が異なる**ことです。

## URL形式の違い

### Vercel環境（正常）
```javascript
// api/ada/requests.js
const signUrl = `${req.headers.origin}/sign/${requestId}`;
// 生成されるURL: /sign/req_123456_abc
```

### ローカル環境（問題あり）
```javascript
// server/routes/requests.js 
const signUrl = `${baseUrl}/sign?request=${otcRequest.id}`;
// 生成されるURL: /sign?request=req_123456_abc
```

### フロントエンド（期待する形式）
```javascript
// src/Router.tsx
<Route path="/sign/:requestId" element={<SigningPage />} />

// src/components/sign/SigningPage.tsx
const { requestId } = useParams<{ requestId: string }>();
// パスパラメータ /sign/123 を期待
```

## エラーの流れ
1. ローカル環境でリクエスト作成 → `/sign?request=123` のURL生成
2. ユーザーがURLにアクセス → useParamsでrequestIdがundefined
3. API呼び出し失敗 → 空/不正なデータ取得
4. amount_modeが期待値でない → 「不明な金額モードです」エラー

## 修正方法

### 方法1: Fastifyサーバーの修正（推奨）
```javascript
// server/routes/requests.js の76行目を修正
// 修正前
const signUrl = `${baseUrl}/sign?request=${otcRequest.id}`;

// 修正後  
const signUrl = `${baseUrl}/sign/${otcRequest.id}`;
```

### 方法2: SigningPageの修正（互換性重視）
```javascript
// src/components/sign/SigningPage.tsx
import { useParams, useSearchParams } from 'react-router-dom';

const SigningPage = () => {
  const { requestId: pathRequestId } = useParams<{ requestId: string }>();
  const [searchParams] = useSearchParams();
  const queryRequestId = searchParams.get('request');
  
  // パスパラメータを優先、フォールバックでクエリパラメータ
  const requestId = pathRequestId || queryRequestId;
  
  // 以下は既存コードのまま
}
```

## 推奨される対応
**方法1（Fastifyサーバーの修正）**を推奨します。理由：
- Vercel環境との一致
- URLが分かりやすい
- 修正箇所が最小限

## 修正後の確認手順
1. サーバー修正後、両環境を再起動
2. 管理画面でリクエスト作成
3. 生成されたURLの形式確認（`/sign/req_xxx`）
4. 署名ページで正常にデータ取得されることを確認