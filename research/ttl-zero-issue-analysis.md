# TTLが0になる問題の分析

## 発見された問題

署名時のサーバーログから、トランザクションボディのTTLが**0**に設定されていることが判明しました。

### CBORデータ分析

```
txBody: 84a400818258203b4a7045980fa36214d19e4de90de23d7e2f618b18b8c24d10db74c9fb9cf2d201018182583901ca1ead9bc476305b26b80fa8538cebcc97ff11daf32144b555e1cc34505e0a8212b339d9bc4466316c0c49e1361e0ec5a72708440d5951111a022f74be021a000290cd0300a0f5f6
```

CBORデコード結果：
- `84`: array(4) - トランザクション全体は4要素の配列
- `a4`: map(4) - トランザクションボディ（4つのキー）
  - `00`: inputs（入力）
  - `01`: outputs（出力）
  - `02`: fee（手数料）`1a000290cd` = 168141 lovelace
  - `03`: ttl（有効期限）**`00`** = **0**

最後の`0300`がキー3（TTL）の値が0であることを示しています。

## 根本原因

1. **フロントエンドでTTLが正しく設定されていない**
   - トランザクションビルド時に`ttl_slot`が渡されていない
   - または、`ttl_slot`が`undefined`で、デフォルト値も機能していない

2. **プロトコルパラメータのcurrentSlotが取得できていない**
   - `protocolParams.currentSlot`が`undefined`の可能性

## 解決策

### 1. プロトコルパラメータの確認
```javascript
// api/ada/protocol-params.js
const currentSlot = blockData.slot || calculateFallbackSlot();
```

### 2. トランザクションビルダーのデバッグ
```javascript
// src/lib/txBuilders.ts
console.log('🔍 TTL Debug:', {
  configTtlSlot: this.config.ttlSlot,
  currentSlot: currentSlot.to_str(),
  protocolParamsCurrentSlot: this.config.protocolParams.currentSlot,
  calculatedTtl: ttl.to_str()
});
```

### 3. SigningPageでの確認
```javascript
// src/components/sign/SigningPage.tsx
console.log('🔍 Transaction builder config:', {
  ...txBuilderConfig,
  requestTtlSlot: state.request.ttl_slot,
  requestTtlAbsolute: state.request.ttl_absolute
});
```

## 次のステップ

1. プロトコルパラメータAPIが正しくcurrentSlotを返しているか確認
2. トランザクションビルダーでTTL計算のデバッグログを追加
3. リクエストデータのttl_slotが正しく渡されているか確認