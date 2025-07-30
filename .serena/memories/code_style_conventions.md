# コードスタイル・規約

## TypeScript設定
- **strict**: true (厳格な型チェック)
- **noUnusedLocals/Parameters**: true
- **Path mapping**: `@/*` → `./src/*`
- **JSX**: react-jsx (React 17+自動インポート)

## ESLint設定
- **@eslint/js**: recommended
- **typescript-eslint**: recommended
- **react-hooks/recommended-latest**: React Hooks規則
- **react-refresh/vite**: Vite HMR対応

## 命名規則
- **コンポーネント**: PascalCase (例: `UTxOTable.tsx`)
- **hooks**: camelCase + use prefix (例: `useYoroiConnect`)
- **型定義**: PascalCase interface/type
- **定数**: UPPER_SNAKE_CASE
- **ファイル名**: kebab-case または PascalCase

## コンポーネント構造
```typescript
// 1. imports
// 2. types/interfaces 
// 3. component definition
// 4. export default

// Props interface
interface ComponentProps {
  prop: string;
}

// Component with React.FC
export const Component: React.FC<ComponentProps> = ({ prop }) => {
  // hooks
  // handlers
  // render
}
```

## コメント規約
- JSDoc形式でコンポーネント・関数説明
- 複雑なロジックには日本語コメント
- デバッグログ: `console.log('🔍 description:', data)`