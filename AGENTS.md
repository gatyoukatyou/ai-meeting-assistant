# AGENTS.md

## Purpose / 目的

```
This document defines mandatory rules and invariants for Codex when
modifying this repository.

Codex must follow these instructions strictly.
If a requested change conflicts with these rules, Codex must stop
and explain the conflict instead of proceeding.

本ドキュメントは、本リポジトリを Codex が変更する際に
必ず守るべきルールと不変条件を定義します。

指示がこれらのルールと衝突する場合、
Codex は作業を中断し、その理由を説明してください。
```

## Language Policy / 言語ポリシー（必須）

```
All user-facing documentation MUST be written in Japanese with English
provided alongside.

Japanese is the primary language.
English must always be included as a paired translation.

README, SECURITY.md, and any new documentation must follow this rule.

ユーザー向けドキュメントは必ず
「日本語＋英語併記」で記述してください。

日本語を主とし、英語は省略せず必ず併記します。
README、SECURITY.md、その他新規ドキュメントも同様です。
```

## Security Invariants / セキュリティ不変条件（最重要）

### 1️⃣ No HTML Injection APIs / HTML 注入 API 禁止

```
The following APIs MUST NOT be used anywhere in this repository:

- innerHTML
- outerHTML
- insertAdjacentHTML

All DOM updates must be performed using:
- createElement
- textContent
- appendChild

以下の API は使用禁止です：

- innerHTML
- outerHTML
- insertAdjacentHTML

DOM 更新は必ず
createElement / textContent / appendChild
を使用してください。
```

### 2️⃣ No Inline Event Handlers / inline イベント禁止

```
Inline event handlers are strictly forbidden:

- onclick
- onchange
- onkeypress
- any on* attributes in HTML

All event handling must be registered via JavaScript
after DOMContentLoaded using addEventListener.

HTML に以下の inline イベント属性を置くことは禁止です：

- onclick
- onchange
- onkeypress
- その他 on* 属性

イベント処理は必ず DOMContentLoaded 後に
addEventListener で登録してください。
```

### 3️⃣ URL Handling Invariant / URL 取り扱い不変条件

```
User-controlled input MUST NEVER be directly assigned to:

- a.href
- window.location.href
- location.assign
- setAttribute("href"/"src")

All navigation influenced by user input MUST go through
the shared URL validation helper (safeURL / navigateTo).

javascript:, data:, vbscript: schemes must be rejected.
Only http/https are allowed.

ユーザー入力が直接以下に代入されることは禁止です：

- a.href
- window.location.href
- location.assign
- setAttribute("href"/"src")

ユーザー入力が関与する遷移は必ず
共通 URL 検証ヘルパー（safeURL / navigateTo）を経由してください。

javascript:, data:, vbscript: スキームは禁止し、
http / https のみを許可します。
```

### 4️⃣ Execution Timing / 実行タイミングの原則

```
No user-controlled data may be executed during HTML parsing.

All logic must run:
- after DOMContentLoaded
- via explicit JavaScript control flow

HTML パース時にユーザー入力が実行される経路を
作ってはいけません。

すべての処理は DOMContentLoaded 後に
JavaScript で制御してください。
```

## CSP Readiness / CSP 前提条件

```
This project is intentionally structured to allow a strict CSP:

- No inline scripts
- No inline event handlers
- No HTML injection APIs

Codex must not introduce changes that would require
'script-src unsafe-inline'.

本プロジェクトは強力な CSP 導入を前提としています。

- inline script なし
- inline event handler なし
- HTML 注入 API なし

'script-src unsafe-inline' を必要とする変更は禁止です。
```

## Verification Rules / 検証ルール

```
Automated tests may not exist.

Codex must verify changes by:
- rg search for forbidden APIs and patterns
- reasoning-based review of DOM execution paths

Verification steps must be summarized in the final message.

自動テストが存在しない場合があります。

Codex は以下で検証してください：
- rg による禁止 API / パターンの検索
- DOM 実行経路の論理レビュー

検証方法は必ず最終メッセージで要約してください。
```

## Repo Hygiene / リポジトリ衛生

```
Local assistant artifacts must never be committed.

Examples:
- .serena/
- temporary local workspaces

Codex must ensure .gitignore is respected.

ローカルアシスタント由来のファイルは
絶対にコミットしないでください。

例：
- .serena/
- 一時作業ディレクトリ

.gitignore を必ず尊重してください。
```

## Stop Conditions / 作業中断条件

```
Codex MUST stop and ask for confirmation if:

- A requested change violates any invariant above
- A security-sensitive change is ambiguous
- A user instruction conflicts with this document

以下の場合、Codex は必ず作業を中断してください：

- 本指示書の不変条件に違反する場合
- セキュリティ上の判断が曖昧な場合
- ユーザー指示と本書が衝突する場合
```

## Final Note / 最後に

```
Security and clarity take precedence over speed or convenience.

When in doubt, choose the safer option and explain the reasoning.

速度や利便性よりも、
セキュリティと明確性を最優先してください。

迷った場合は、安全側を選び、その理由を説明してください。
```

## Next Actions / 次のアクション

```
1. Keep AGENTS.md at the repository root.
2. When initializing Codex (/init), load these instructions.
3. All future changes must assume these rules.

1. 本ドキュメント (AGENTS.md) はリポジトリ直下に保持してください。
2. Codex を初期化する際 (/init) は、この指示を読み込んでください。
3. 今後の変更はすべて、このルールを前提として行ってください。
```
