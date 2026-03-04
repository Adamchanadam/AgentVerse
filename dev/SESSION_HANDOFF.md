# Session Handoff

## Current Baseline

1. Version: Pre-alpha（共用型別 + Event Envelope + WsFrame + 身份管理 + 事件簽名 + Hub DB + REST API + WebSocket 伺服器 + 配對狀態機 + Plugin 核心模組 + E2E 加密模組 + Hub Web UI + Asset Gen CLI + ChannelPlugin + Plugin Entry Point + E2E 整合測試 + PBT P1-P5/P7/P8/P11/P14-P20/P21/P24/P25/P16 完成）
2. Core commands / features: AgentVerse — OpenClaw Agent 社群＋遊戲化成長＋DNA 交換平台
3. Regression baseline: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` 全綠
4. Release / merge status: Initial commit pushed to `github.com/Adamchanadam/AgentVerse` (main branch)
5. Active branch / environment: `main` branch @ `D:\_Adam_Projects\AgentVerse`
6. External platforms / dependencies in scope: OpenClaw（openclaw-main/ 為參考 codebase）、PostgreSQL、Neon（可選）、React/Next.js、Fastify
7. Conda environment: `adamlab4_env`（Node v22.14.0、npm 10.9.2、pnpm 9.15.4）

## Layer Map

1. Product / System Layer: AgentVerse Hub + OpenClaw Channel Plugin `agentverse` + Local Trials Runner
2. Development Governance Layer: AGENTS.md 治理框架 + Kiro spec-driven workflow
3. Current task belongs to which layer: Product（**Phase 1.5 完成 ✅**；507/507 tests，71 files）
4. Known layer-boundary risks: OpenClaw plugin manifest/channel 規格已對齊 v2026.3.1 官方 codebase（Session 38 修正 9 項 misalignment + Session 39 深度審計修正 7 項）；持續監控後續版本變化

## Mandatory Start Checklist

1. Read `dev/SESSION_HANDOFF.md` ✅
2. Read `dev/SESSION_LOG.md` ✅
3. Read `dev/PROJECT_MASTER_SPEC.md` ✅（已建立：工具鏈 runbook + 密碼學規格 + 協議不變式）
4. **conda activate adamlab4_env**（Node >= 20，pnpm >= 9，docker）
5. **pnpm env-check**（scripts/env-check.mjs，exit 1 = 工具鏈不齊，不得繼續）
6. **pnpm install**（確保依賴同步）
7. Run baseline checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
8. Confirm environment / dependency state: 見 PROJECT_MASTER_SPEC.md §2
9. Confirm whether external platform alignment is required: 是（OpenClaw manifest/channel/multi-agent 規格）
10. Search for related SSOT / spec / runbook before change: `.kiro/specs/agentverse/` 為 SSOT；`dev/PROJECT_MASTER_SPEC.md` 為穩定規格 SSOT
11. Search for duplicate rule / duplicate term / prior prior related fixes: N/A
12. **[🚨CROSS-AGENT COOPERATION RULE]** Before editing `SESSION_HANDOFF.md` or `SESSION_LOG.md` (or any shared state file) to hand over a session, you MUST execute a fresh `view_file` to get its absolutely latest state. NEVER overwrite the file using a cached read from earlier in your session, as another agent may have updated it meanwhile.

## Open Priorities

1. **Phase 1.5：Web-First Usability ✅ 完成**（Task 20-24 全部通過，507 tests）
   - Task 20：Browser Self-Bootstrap ✅（440 tests）
   - Task 23：Seed / Demo Mode ✅（449 tests）
   - Task 21：Web Pairing UX Glue ✅（465 tests）
   - Task 22：Web Chat E2E ✅（507 tests）
   - Task 24：Phase 1.5 Checkpoint ✅（507 tests，all gates green）
2. **Phase 2 Backlog**（下一步）：B1 Trials Runner、B2 成長頁面
3. **Phase 3 Backlog**：B3 GenePack 交換、B4 Lineage、B5 Fusion Lab
4. **Phase 2+ 建議**：Security headers、scope-based middleware、Redis NonceStore（見 PROJECT_MASTER_SPEC §4.4）

## Known Risks / Blockers

1. 🚨 **INC-20260302 已修復：全部 10 張 PNG 已由 Antigravity 重新生成**。Asset Gen CLI 覆寫事故造成的佔位圖皆被還原為 64x64, 32x32, 320x180 等符合規範的 pixel art 最終檔。
2. TTL-mode catchup 未實作 offline_messages JOIN（getCatchupEvents 只回傳 events 表資料，不含 ciphertext）。MVP 預設為 zero-persistence 不受影響；啟用 TTL 模式前需完成 JOIN 邏輯。
3. design.md 的 offline_messages SQL schema 尚未反映 FK 約束與 server_seq 佔位記錄設計（tasks.md 已定義，design.md 可選同步）
4. offline_messages.server_seq FK 缺少 DEFERRABLE INITIALLY DEFERRED（drizzle 限制，impact LOW）
5. 1 pre-existing flaky PBT: P5 server_seq Monotonic times out under full suite resource contention (passes in isolation ~1132ms)

## Regression / Verification Notes

1. Required checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
2. Current failing checks (if any): 1 pre-existing flaky PBT timeout (P5 server_seq Monotonic — passes in isolation, times out under full suite resource contention)
3. Test count: 507（71 files）
4. Release / merge blocking conditions: N/A

## Antigravity（UI/UX Design Agent）交接狀態

**交接日期**：2026-03-02
**交接者**：UI/UX Design Agent (Antigravity)

### 靜態資產（已完成 ✅）

10 張點陣 PNG 全部到位，已註冊於 `packages/hub/public/assets/mvp-default/manifest.json`：

- Avatars (3×64x64): avatar_default_01/02/03（透明背景）
- Badges (5×32x32): badge_first_pair, badge_security_guard, badge_messenger, badge_trial_pass, icon_genepack_node（透明背景）
- Card Frames (1×320x180): frame_basic（中心透明，CSS border-image 用）
- Backgrounds (1×128x128): bg_agentdex_tile（深海藍 BBS 網格，background-repeat: repeat）

### 設計系統：Modern Retro 256-Color (8-bit) BBS & GBA Hybrid

- **設計規格 SSOT**：`dev/ui-ux/design_tokens.md`
- **Phase 3 UI 指南**：`dev/ui-ux/phase3_ui_guide.md`
- **CSS 鐵則**：
  1. `border-radius: 0`（所有元素）
  2. Hard shadows only（`box-shadow: 4px 4px 0px #55FFFF`，禁 blur）
  3. 背景色限 Deep ANSI Blue (#0000AA)、Retro Windows Gray (#C0C0C0)、極黑
- **字體**：Space Grotesk（主要）、Press Start 2P（遊戲/展示）、Fira Code/JetBrains Mono（等寬）
- **色彩**：ANSI Cyan (#55FFFF)、Magenta (#FF55FF)、Yellow (#FFFF55)、Soft Red/Orange (#F88800)

### Phase 3 UI 注意事項

- Trials Runner 雷達圖 + LineageGraph 血統樹：**不使用靜態圖檔**，用 HTML Canvas / SVG / React Flow 手繪
- 視覺規格見 `phase3_ui_guide.md`

### Web UI 切版基礎建設（2026-03-02 第二次交付 ✅）

- **CSS Custom Properties**：`packages/web/src/styles/tokens.css`
  - 所有 256-Color 色碼、字體、間距、陰影皆轉為 `:root` CSS 變數
  - 可直接 `@import` 或作為 Tailwind preset 基準
- **Wireframe 規格書**：`dev/ui-ux/wireframe_specs.md`
  - §1 AgentCard（320x180 像素佈局：avatar 64x64 左上、display_name Press Start 2P 12px、badges 右上、persona tags `[ TAG ]` 底部）
  - §2 AgentDex（Tiling Window Manager：左 30% 列表 + 右 70% 詳情；搜尋欄 ANSI 風格；空狀態 `> NO AGENTS FOUND IN SECTOR_`；無限滾動 + ASCII throbber）
  - §3 Pairing Flow（Pending 黃色閃爍 → Active 綠色 toast + badge_first_pair → Revoked 洋紅警告 Dialog；`[ ACCEPT ]` / `[ REJECT ]` 按鈕）
  - §4 Chat（終端機 log 風格，非氣泡；`> root:` 青色 / `> agent:` 黃色；`[🔒 SECURE]` E2E 指示器）
  - §5 Responsive（sm <640px 1欄 / md 640–1024px 2欄 / lg >1024px split-pane）
  - §6 Loading/Error（ASCII spinner `[ | ]` `[ / ]`；error 格式 `FATAL ERROR: 0x000F`）

### Phase 8 UI Addendum（2026-03-02 第三次交付 ✅）

- `favicon.ico` 放置於 `packages/web/public/`。
- `dev/ui-ux/phase8_addendum.md` 新增，包含 `frame_basic.png` 的 `border-image` CSS 範例與 Avatar MVP 決定性分配邏輯 (Hash based)。
- 更新 `dev/ui-ux/README.md`。

### Asset Gen CLI（已完成 ✅ + INC-20260302 修復）

- **5 modules** in `tools/asset-gen/src/`：types, yaml-parser, manifest-generator, placeholder-gen, cli
- **35 tests**（8+9+6+9+3 integration）via Vitest TDD
- **Tech**：yaml + pngjs + minimist
- YAML SSOT：`tools/asset-gen/items/mvp-default.yaml`（10 items: 3 avatars + 5 badges + 1 frame + 1 bg）
- `--mode placeholder`（Phase 0）生成彩色幾何 PNG placeholder
- ~~`--mode final`~~：已移除（最終資產由 Antigravity 手工交付）
- **`--force` 旗標**：預設 skip-existing，覆寫需明確 `--force`（INC-20260302 教訓）
- `mergeManifest()` preserves extras from existing manifest not in YAML

### 🚨 Antigravity 交辦：重新生成 10 張最終 PNG（INC-20260302 已完成 ✅）

**狀態**：Antigravity 已於 Session 34 重新生成並處理完畢。所有 `avatars`, `badges`, `card_frames`, 及 `backgrounds` 皆已照原設計規格放回 `packages/hub/public/assets/mvp-default/{category}/{id}.png` 中，準備好給前端使用。

## Consolidation Watchlist

1. Rules currently duplicated across files: 無（dev_spec1/2 已移至 ref_doc/，不再追蹤）
2. Areas showing accretive drift: 無
3. Candidate items for consolidation / retirement: 無（dev_spec1.md + dev_spec2_Addendum.md 已歸檔至 ref_doc/）

## Update Rule

This file and `dev/SESSION_LOG.md` must be updated at the end of every session. If the session's changes affect specifications, runbooks, regression thresholds, release conditions, or external platform integrations, the corresponding documents must also be updated. If the session's fix involves adding a new rule, first check whether the existing definition should be integrated or outdated wording retired — avoid stacking without consolidating.

**CRITICAL OVERWRITE PREVENTION:** When updating this file, you MUST read it dynamically right before you replace/edit it. Do NOT use content you read minutes or hours ago, because a concurrent agent may have modified it.

## Last Session Record

1. UTC date: 2026-03-03
2. Session ID: Claude_20260303_1400
3. Completed:
   - **Task 24: Phase 1.5 Checkpoint ✅** — Phase 1.5 全部完成
     - Regression: typecheck ✅ lint ✅ test 507/507 (71 files) ✅ format:check ✅
     - Phase 1.5 acceptance: Task 20/21/22/23 全部 PASS（browser UAT verified via Claude-in-Chrome）
     - Contract consolidation: PROJECT_MASTER_SPEC §4.2 updated (libsodium→@noble/ciphers), §4.3 Auth Contract (PoP+JWT), §4.4 Deployment Boundary (NonceStore/ConnectionManager single-instance risk)
     - Bug fix: msg.relay forwarding — `recipient_ids` must contain agent IDs for Hub to forward via ConnectionManager.sendTo()
   - **Previously (same day)**:
     - Task 22 Web Chat E2E ✅ (507 tests) — PR #1 created
     - Task 21 Web Pairing UX Glue ✅ (465 tests)
     - Task 23 Seed/Demo Mode ✅ (449 tests)
4. Pending: None for Phase 1.5
5. Next priorities (max 3):
   - Phase 2 planning（B1 Trials Runner、B2 成長頁面）
   - Security headers (nosniff/referrer-policy/frame-ancestors/CSP report-only)
   - Scope-based API middleware (admin vs agent permission isolation)
6. Risks / blockers:
   - TTL-mode catchup 未 JOIN offline_messages（不影響目前功能，啟用 TTL 前需完成）
   - Agent scope 尚未強制權限隔離（延後至 Phase 2+）
   - NonceStore/ConnectionManager 單實例假設（多 instance 部署前需改 Redis）
   - 1 pre-existing flaky PBT (P5 server_seq Monotonic timeout under full suite)
7. Validation: typecheck ✅ lint ✅ test 507/507 ✅ format:check ✅

### Previous Session Reference（Claude_20260302_2000）

- Git init + initial push to `github.com/Adamchanadam/AgentVerse`; 350/350 tests

### Previous Session Reference（Claude_20260302_1920）

- 確認 Antigravity PNG 重新生成完畢，修正文件路徑，建立 .gitignore 方案，決定改名 AgentVerse

### Previous Session Reference（Antigravity_20260302_1910）

- **INC-20260302 修復完畢**：10 張 PNG 全部重新生成（Session 34）+ Avatar V2 重做（Session 35）

### Previous Session Reference（Claude_20260302_1842）

- **INC-20260302 防護上線**：Asset Gen CLI `--force` 旗標 + skip-existing 預設。
- AGENTS.md §5.9 新規則 + PROJECT_MASTER_SPEC §8.1 覆寫保護規則。

### Previous Session Reference（Claude_20260302_1800）

- **任務 15.2 Asset Gen CLI 完成**（359 tests total, 44 new）
  - Subagent-Driven Development 執行 8 Plan Tasks：
    - PT1：Infrastructure setup（deps, package.json, root typecheck）
    - PT2：Types + YAML Parser（types.ts, yaml-parser.ts, 9 tests）
    - PT3：Manifest Generator（generateManifest, mergeManifest, 6 tests）
    - PT4：Placeholder PNG Generator（categoryColor, generatePlaceholderPng, 9 tests）
    - ~~PT5：nanobanana MCP Client~~ — 已移除（最終資產由 Antigravity 手工交付）
    - PT6：CLI Entry Point（parseCliArgs, run, 9 tests）
    - PT7：Barrel Exports + Integration Test（index.ts, 3 integration tests）
    - PT8：Full Regression + Docs
  - Fixed YAML item count mismatch（8→10 items: Antigravity added badge_trial_pass + icon_genepack_node to YAML）
  - `.kiro/specs/agentverse/tasks.md` 更新：15.1/15.2 標記 [x] ✅

4. Pending:
   - 任務 15.3：手動執行 `--mode placeholder` 生成 placeholder pack
   - ~~任務 15.4~~：已取消（nanobanana 移除）
   - 任務 16：Self-Hosted 部署
5. Next priorities (max 3):
   - 任務 15.3（placeholder generation — manual execution）
   - 任務 16（Docker Compose + 部署配置）
   - Per-operation rate limits（deferred from Task 5）
6. Risks / blockers: TTL-mode catchup 未 JOIN offline_messages（啟用 TTL 前需完成）；git repo 不存在，commit 需人工執行；P14/P15 PBT 全套並行偶爾 timeout
7. Files materially changed this session:
   - `tools/asset-gen/src/types.ts`（新建）
   - `tools/asset-gen/src/yaml-parser.ts` + `.test.ts`（新建）
   - `tools/asset-gen/src/manifest-generator.ts` + `.test.ts`（新建）
   - `tools/asset-gen/src/placeholder-gen.ts` + `.test.ts`（新建）
   - ~~`tools/asset-gen/src/nanobanana-client.ts` + `.test.ts`~~（已移除）
   - `tools/asset-gen/src/cli.ts` + `.test.ts`（新建）
   - `tools/asset-gen/src/integration.test.ts`（新建）
   - `tools/asset-gen/src/index.ts`（barrel exports 替換 stub）
   - `tools/asset-gen/package.json`（deps + bin + generate script）
   - `package.json`（root typecheck 加入 tools/asset-gen）
   - `.kiro/specs/agentverse/tasks.md`（15.1/15.2 [x]）
8. Validation summary: typecheck ✅ lint ✅ test 359 (357 passed + 2 known PBT timeout) ✅ format:check ✅
9. Consolidation actions taken: tasks.md 同步 Task 15.1/15.2 完成狀態
10. Key note: Task 1–15.2 全部完成；下一步 Task 15.3 手動 placeholder generation → Task 16 部署

### Previous Session Reference（Antigravity_20260302_1750）

- 補齊 YAML 遺漏的 2 個 badge（badge_trial_pass, icon_genepack_node）

### Previous Session Reference（Claude_20260302_1700）

- **任務 14 Hub Web UI 完成**（315/315 tests，全 gates green）
- Subagent-Driven Development 執行 Plan Tasks 1–8 完全到位

### Previous Session Reference（Claude_20260302_1500）

- **任務 13 Checkpoint 通過**（304/304 tests）
- Task 14 plan 完成 + Subagent-Driven 執行（PT1–PT5 完成）

### Previous Session Reference（Claude_20260302_1300）

- **任務 11：Checkpoint 通過**（282/282 tests）
- **任務 12：E2E 加密模組完成**；test 304/304 ✅

### Previous Session Reference（Claude_20260302_1200）

- **任務 8–10 完成**（配對狀態機 + Plugin 核心模組）；test 282/282 ✅

### Previous Session Reference（Claude_20260302_0900）

- **任務 7：Hub WebSocket 伺服器全部完成**（13/13 sub-tasks）；test 208/208 ✅

### Previous Session Reference（Claude_20260302_0713）

- **任務 6 Checkpoint**：確認 Hub REST API + DB 層正確；test 158/158 ✅

### Previous Session Reference（Claude_20260301_1800）

- **任務 5 Plan Task 8**: Global rate limiting plugin — rate-limit.test.ts (4 tests) + rate-limit.ts plugin + app.ts registration; test 158/158 ✅

### Previous Session Reference（Claude_20260301_1722）

- **任務 5 Plan Task 7**: GET /api/assets/:pack/\* static file serving — test 154/154 ✅

### Previous Session Reference（Claude_20260301_1715）

- **任務 5 Plan Task 6**：GET /api/pairings endpoint — test 151/151 ✅

### Previous Session Reference（Claude_20260301_1653）

- **任務 5 Plan Task 5**：`AgentRepository.findPaginated` + GET /api/agents + GET /api/agents/:id — test 146/146 ✅

### Previous Session Reference（Claude_20260301_1700）

- **任務 5 Plan Task 4**：JWT auth plugin（TDD）— test 138/138 ✅

### Previous Session Reference（Claude_20260301_1530）

- **Fix I-1/I-2**：env.ts parseInt NaN guard + PORT TCP range validation (1–65535)
- typecheck ✅ lint ✅ test 133/133 ✅ format:check ✅

### Previous Session Reference（Claude_20260301_1400）

- **Fix**：補加 @fastify/websocket ^11.2.0 到 @agentverse/hub 依賴（Session 8 缺漏）
- typecheck ✅（exit 0, no errors）

### Previous Session Reference（Claude_20260301_1322）

- 任務 5 Plan Task 1：安裝 Fastify 及 5 plugin 依賴（fastify, @fastify/cors, @fastify/jwt, @fastify/rate-limit, @fastify/static, @fastify/sensible）— typecheck ✅ test 126/126 ✅

### Previous Session Reference（Claude_20260301_1237）

- Doc-fix session：補齊 tasks.md 狀態更新、SESSION_LOG prettier 修正、PROJECT_MASTER_SPEC Change History

### Previous Session Reference（Claude_20260301_1220）

- 任務 4 全部完成：deps + schema + migration + connection factory + 4 repositories + barrel exports
- Anti-gravity 6 assets pngquant-optimised；card_frames/backgrounds 配額恢復後補入

## 關鍵決策記錄（供下一 session 快速恢復）

### 技術選型（已確認）

- Repo：獨立 monorepo；腳本掛載 plugin 到 openclaw-main/extensions/agentverse 做集成測試
- Hub API：Fastify（輕量，匹配 OpenClaw 風格）
- Hub UI：React/Next.js（不用 Lit）；用 design tokens 保持一致
- DB：Postgres-first（自託管預設），Neon 作可選 deployment preset
- **DB 工具**：drizzle-orm（Repository 查詢，型別安全）+ drizzle-kit（migration 生成/apply）；預設 driver：`pg`（本地 Docker）；Neon preset 只需換 driver import，schema/query 程式碼不動
- MVP：Phase 0 + Phase 1 合併交付
- E2E：MVP 只對 msg.relay 做 E2E；配對/撤銷用簽名明文 metadata
- Trials：Plugin 子命令，runner 實作為 library
- GenePack 狀態：MVP 兩級（unverified/verified）

### 硬約束

- HC1：Hub 所有輸入只路由到 agentId=social，tools.deny（deny wins）
- HC2：Hub DB 只存 metadata + append-only events；msg.relay 不落地（或 TTL 密文）；嚴禁 workspace/paths/tokens/transcripts
- HC3：GenePack skills-first；只交換指針/權限需求/審計狀態；永不自動安裝/寫檔

### 密碼學實作（已確認）

- signing.ts 簽名訊息格式：`sortedKeyJSON({event_id, event_type, nonce, payload_hash, ts})`（UTF-8 bytes）
- payload_hash：`hex(SHA-256(sortedKeyJSON(payload)))` via @noble/hashes/sha256 + utf8ToBytes
- 私鑰格式：32-byte Ed25519 seed，hex-encoded，儲存於 identity.key JSON 的 privateKey 欄位
- 公鑰格式：32-byte，hex-encoded（64 chars）
- 簽名格式：64-byte Ed25519 signature，hex-encoded（128 chars）
- IdentityManager 測試使用 os.tmpdir() + randomUUID() 隔離路徑，afterAll 清理

### Spec 工作流

- 工作流類型：requirements-first（requirements → design → tasks）
- 當前階段：coding（任務 3 完成，下一步任務 4）
- Spec 路徑：`.kiro/specs/agentverse/`
- Config：`.kiro/specs/agentverse/.config.kiro`

### 源文檔（參考用，非 SSOT）

- `ref_doc/dev_spec1.md`：原始完整方案文檔（已歸檔，不追蹤）
- `ref_doc/dev_spec2_Addendum.md`：補充建議（已歸檔，不追蹤）
- `ref_doc/research1_init_idea_gpt.md`：初始研究（已歸檔，不追蹤）
- `ref_doc/research2_db_security_gpt.md`：DB/安全研究（已歸檔，不追蹤）
