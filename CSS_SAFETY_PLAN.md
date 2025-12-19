# CSS Safety Plan / CSS安全化計画

## Current State / 現状

- **CSP Status**: `style-src 'self' 'unsafe-inline'`
- **`<style>` tags**: 3 files (index.html, config.html, 404.html)
- **inline `style=""` attributes**: 32 instances
- **External CSS files**: 0

## Security Goal / セキュリティ目標

Remove `'unsafe-inline'` from `style-src` directive to prevent injection attacks through CSS.

`style-src` ディレクティブから `'unsafe-inline'` を削除し、CSS経由のインジェクション攻撃を防ぐ。

## Migration Strategy / 移行戦略

### Phase 1: Extract `<style>` tags to external CSS / フェーズ1: `<style>` タグを外部CSSに抽出

**Target files**:
- `index.html` (line 11-809)
- `config.html` (line 11-371)
- `404.html` (if exists)

**Action**:
1. Create `css/main.css` for shared styles
2. Create `css/config.css` for config-specific styles
3. Replace `<style>` tags with `<link rel="stylesheet" href="css/main.css">`

**Estimated effort**: 30 minutes

### Phase 2: Convert inline styles to CSS classes / フェーズ2: inline style を CSS クラスに変換

**Categories**:

1. **Display control** (18 instances)
   - `style="display:none"` → `class="hidden"`
   - JavaScript should toggle classes, not modify `style` attribute

2. **Layout adjustments** (10 instances)
   - `style="margin-bottom: 0.75rem"` → `class="mb-3"`
   - `style="padding: 1rem; padding-bottom: 0"` → `class="p-4 pb-0"`

3. **Sizing** (4 instances)
   - `style="width: 100%"` → `class="w-full"`
   - `style="max-width: 150px"` → `class="max-w-150"`

**Action**:
1. Create utility classes in external CSS
2. Update HTML to use classes
3. Update JavaScript to use `classList.toggle()` instead of `style.display`

**Estimated effort**: 1 hour

### Phase 3: Update CSP / フェーズ3: CSP更新

**Before**:
```html
style-src 'self' 'unsafe-inline';
```

**After**:
```html
style-src 'self';
```

**Validation**:
- Test all pages in browser
- Check DevTools for CSP violations
- Verify dynamic styling (JS-controlled visibility) still works

## Files to Create / 作成するファイル

```
css/
├── main.css       # Shared styles (from index.html + config.html <style>)
├── config.css     # Config-specific styles
└── utilities.css  # Utility classes for inline style replacements
```

## Breaking Changes / 破壊的変更

None. This is a refactoring that maintains identical visual appearance.

なし。これは見た目を維持したままのリファクタリングです。

## Testing Checklist / テストチェックリスト

- [ ] index.html renders correctly
- [ ] config.html renders correctly
- [ ] Modal animations work
- [ ] Responsive design preserved
- [ ] JavaScript-controlled visibility works
- [ ] Cost display toggle works
- [ ] Settings import/export UI functions
- [ ] No CSP violations in DevTools Console

## Priority / 優先度

**Medium** - This improves security posture but is not critical since:
- Current CSP already blocks most dangerous attacks
- CSS injection is less severe than script injection
- The app has no user-generated CSS content

**中** - セキュリティ向上につながるが、以下の理由で緊急ではない：
- 現在のCSPで既に大半の危険な攻撃はブロックされている
- CSSインジェクションはスクリプトインジェクションよりも深刻度が低い
- アプリにはユーザー生成CSSコンテンツがない

## Next Steps / 次のステップ

1. Review and approve this plan
2. Implement Phase 1 (extract `<style>` tags)
3. Test thoroughly
4. Implement Phase 2 (convert inline styles)
5. Test thoroughly
6. Implement Phase 3 (update CSP)
7. Final validation

## Notes / 備考

- Keep `'unsafe-inline'` until all phases complete
- Use git branches for incremental implementation
- Consider using Tailwind CSS if adding more features (optional)

---

Created: 2024-12-20
Status: Proposed (提案中)
