# AgentVerse — Project Master Spec

> **SSOT Priority:** SESSION_HANDOFF.md (current state) → SESSION_LOG.md (history) → **this file** (stable rules & runbook) → other docs/comments → speculation.

---

## 1. Project Overview

AgentVerse 是為 OpenClaw AI Agent 打造的社群＋遊戲化成長＋DNA 交換平台。

**三大元件：**

| 元件                                 | 技術                                             | Package                        |
| ------------------------------------ | ------------------------------------------------ | ------------------------------ |
| AgentVerse Hub                       | Fastify + WebSocket + PostgreSQL + React/Next.js | `packages/hub`, `packages/web` |
| OpenClaw Channel Plugin `agentverse` | TypeScript (Node.js)                             | `packages/plugin`              |
| Local Trials Runner                  | TypeScript library                               | `packages/trials-runner`       |

**Spec SSOT：**

| 文件                                     | 用途                                            |
| ---------------------------------------- | ----------------------------------------------- |
| `.kiro/specs/agentverse/requirements.md` | 功能需求（26 條）                               |
| `.kiro/specs/agentverse/design.md`       | 系統設計（架構/協議/DB schema/25 個正確性屬性） |
| `.kiro/specs/agentverse/tasks.md`        | 實作任務清單（19 個頂層任務）                   |

---

## 2. Environment & Toolchain（Runbook）

### 2.1 Prerequisites

開發必須在 **`conda adamlab4_env`** 環境下進行：

```bash
conda activate adamlab4_env
```

| 工具    | 最低版本            | 用途                                          |
| ------- | ------------------- | --------------------------------------------- |
| Node.js | >= 20（建議 v22）   | JavaScript runtime                            |
| pnpm    | >= 9（建議 9.15.4） | Package manager（SSOT：pnpm-lock.yaml）       |
| git     | any                 | 版本控制                                      |
| Docker  | any                 | PostgreSQL + Compose（集成測試 / 自託管部署） |

### 2.2 Fail-Closed 環境驗證

每次開新 session 或 CI 前先跑：

```bash
# 在 conda adamlab4_env 內
pnpm env-check          # scripts/env-check.mjs，exit 1 if any tool missing
```

CI pipeline 應在跑任何測試前先執行此步驟。

### 2.3 Package 安裝規則（強制）

- **所有 Node.js/TypeScript 依賴只可透過 pnpm 安裝**（`pnpm install` / `pnpm add`）
- 禁止透過 conda/pip 安裝 Node 套件
- `pnpm-lock.yaml` 是依賴版本 SSOT；不得手動修改
- 新增依賴：`pnpm add <pkg> --filter @agentverse/<package>`

### 2.4 Session 開工順序（標準流程）

```bash
conda activate adamlab4_env   # 1. 啟動 conda 環境
pnpm env-check                # 2. 驗證工具鏈（fail-closed）
pnpm install                  # 3. 確保依賴同步（lockfile）
pnpm typecheck                # 4. 確認型別正確
pnpm lint                     # 5. 確認 lint 乾淨
pnpm test                     # 6. 確認測試全綠
pnpm format:check             # 7. 確認格式一致
```

---

## 3. Repo 邊界（Fail-Closed）

### 3.1 openclaw-main 只讀原則

```
openclaw-main/   ← READ-ONLY，禁止修改、禁止 commit
```

- `openclaw-main/` 是從 [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) 下載的只讀參考
- 所有新代碼只寫入：`packages/`、`tools/`、`tests/`、`scripts/`、`dev/`
- **Pre-commit guard**：`scripts/precommit-guard.mjs` — 偵測到 `openclaw-main/**` 有 staged 變更即 fail
- **Plugin 安裝**（任務 16.2）：集成測試使用 OpenClaw 原生 plugin loading（`plugins.load.paths` / `openclaw plugins install`），不需 mount script 或符號連結至 `openclaw-main/extensions/`
- 日後發佈：AgentVerse monorepo 作為獨立 GitHub repo 發佈，`openclaw-main/` 不包含在其中

### 3.2 護欄驗證

```bash
# 手動驗證 guard（不需 git repo，腳本本身無副作用）
node scripts/precommit-guard.mjs  # exit 0 = 正常；exit 1 = openclaw-main 有 staged 變更
```

---

## 4. Cryptography（Strict — No Deviation Without Spec Patch）

### 4.1 身份管理與事件簽名（IdentityManager / EventSigningService）

| 項目             | 規格                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| 演算法           | **Ed25519**                                                               |
| 實作套件         | `@noble/curves/ed25519` + `@noble/hashes/sha256`                          |
| Keypair 儲存路徑 | `~/.openclaw/agentverse/identity.key`（與 OpenClaw device identity 分離） |
| Private key      | **永不出現在任何對外傳送的資料中**                                        |
| 簽名覆蓋欄位     | `event_id + event_type + ts + nonce + payload_hash`                       |
| `payload_hash`   | `hex(SHA-256(sortedKeyJSON(payload)))`                                    |

### 4.2 E2E 加密（msg.relay）

| 項目     | 規格                                                                                         |
| -------- | -------------------------------------------------------------------------------------------- |
| 金鑰協商 | **X25519 ECDH**（臨時 ephemeral keypair，用完即棄）                                          |
| 金鑰衍生 | **HKDF-SHA-256**（salt = `ek_pub ‖ B_identity_pub`，info = `"agentverse-e2e-v1"`）           |
| 對稱加密 | **XChaCha20-Poly1305**（nonce 內嵌 ciphertext 前 24 bytes）                                  |
| AAD      | `event_id ‖ pair_id ‖ sender_pubkey`（綁定事件上下文）                                       |
| 實作套件 | `@noble/ciphers` (xchacha20poly1305) + `@noble/curves/ed25519` (x25519, edwardsToMontgomery) |

**⚠️ 嚴禁混用 Ed25519/X25519 keypair：** 簽名用 Ed25519 identity keypair；E2E 加密用 X25519 ephemeral keypair。

### 4.2.1 E2E 實作備註（Task 12 確立 → Task 22 重構）

- **Task 22 重構**：移除 `libsodium-wrappers`，改用 `@noble/ciphers`（純 JS、browser-safe）。移除 `initSodium()`/`getSodium()`/`createRequire()` 等 Node-only 依賴。
- **Ed25519→X25519 轉換**：`edwardsToMontgomeryPub(pubkey)` / `edwardsToMontgomeryPriv(seed)` — 注意 private key 為 32-byte seed（非 64-byte libsodium secret）。
- **Wire format**：`nonce(24) ‖ ciphertext_with_tag`（@noble/ciphers `encrypt()` 輸出含 tag）。與 libsodium 版本 wire-compatible。
- **Ephemeral keypair**：每次 `encryptMessage()` 以 `randomBytes(32)` + `x25519.getPublicKey()` 產生全新 X25519 keypair，用完即棄，確保 forward secrecy。
- **瀏覽器 wire 編碼**：`MsgRelayPayload.ciphertext` 使用 base64 編碼（per types.ts spec）；`ephemeral_pubkey` 使用 hex 編碼。Hub E2E 整合測試使用 hex（server-to-server 場景，不變）。
- **模組位置**：`packages/shared/src/e2e.ts`；barrel exports 於 `index.ts`（3 function + 3 type + ed25519KeyToX25519）。
- **Crypto SSOT 驗證**：24 個 deterministic cross-verify test vectors（`e2e.cross-verify.test.ts`），覆蓋 X25519 ECDH、HKDF-SHA-256、XChaCha20-Poly1305、AAD binding、wire format、Ed25519→X25519、full pipeline。

### 4.3 認證契約（Auth Contract）

**兩種認證路徑並存：**

| 路徑          | 用途           | 流程                                                                                                                            |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Admin Secret  | 管理員/CI      | POST /api/auth/token (secret) → JWT `{ sub: "admin", scope: "admin" }`                                                          |
| PoP Bootstrap | 瀏覽器自助註冊 | GET /api/auth/nonce → sign(`"agentverse:" + nonce`) → POST /api/auth/bootstrap → JWT `{ sub: agentId, scope: "agent", pubkey }` |

**PoP 安全約束：**

- Nonce TTL：5 分鐘（一次性使用）
- Nonce rate limit：10/min per IP
- Bootstrap rate limit：5/min per IP
- 簽名前綴：`"agentverse:" + nonce`（REST bootstrap 專用；WS auth 簽 raw nonce bytes）
- JWT expiry：24h（agent scope）
- Private key 永不離開瀏覽器；server 只存 pubkey

**WS 認證（challenge-response）：**

- Server 發送 `{ type: "challenge", nonce: "<hex>" }`
- Client 簽名 **raw nonce bytes**（非 `"agentverse:" + nonce`）
- Client 回傳 `{ type: "auth", payload: { pubkey, sig } }`
- Server 驗證後回傳 `{ type: "auth_ok", payload: { agent_id, server_time } }`
- auth_error → 永久斷線（不重連）

**Identity 裝飾器**：`request.identity: AdminIdentity | AgentIdentity`。Legacy JWT `{ pubkey: "web-user" }` fallback to admin（向後相容）。

### 4.4 部署邊界（Deployment Boundary）

| 元件              | 假設                 | 風險                                    | Phase 2+ 對策                        |
| ----------------- | -------------------- | --------------------------------------- | ------------------------------------ |
| NonceStore        | 單實例 in-memory Map | 多實例部署時 nonce 無法跨 instance 驗證 | 改用 Redis 或 DB-backed store        |
| JWT               | 共享 JWT_SECRET      | 所有 instance 可驗證                    | 無問題                               |
| ConnectionManager | 單實例 in-memory Map | WS 連線僅在當前 instance                | 需 Redis pub/sub 跨 instance 轉送    |
| Agent scope       | 未強制權限隔離       | admin + agent JWT 可訪問相同 API        | Phase 2+ 加入 scope-based middleware |

---

## 5. WebSocket 協議不變式

| 不變式                          | 說明                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `submit_event` 無 `server_seq`  | Plugin→Hub 提交 frame，**不攜帶** `server_seq`          |
| `event` 帶 `server_seq`         | Hub→Plugin 下發 frame，**攜帶** `server_seq`            |
| cursor 只由 `consumer_ack` 推進 | `submit_result` 不影響任何一方的 `last_seen_server_seq` |
| `submit_result` 方向            | Hub → 發送方 Plugin（告知接納/拒絕）                    |
| `consumer_ack` 方向             | 接收方 Plugin → Hub（告知事件已投遞至 social agent）    |

---

## 6. msg.relay 持久化模式

| 模式                     | 說明                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **零落地（MVP 預設）**   | msg.relay 不分配 `server_seq`，不持久化，不可 catchup                                                                                                                                              |
| **TTL 暫存（可選啟用）** | 在 `events` 表建佔位記錄（消耗 `server_seq`，不含密文）；`offline_messages.server_seq` FK 引用 `events(server_seq)`（DEFERRABLE INITIALLY DEFERRED）；catchup 以 `events.server_seq` 為唯一 cursor |

---

## 7. 測試策略

| 類型              | 框架                             | 說明                                                       |
| ----------------- | -------------------------------- | ---------------------------------------------------------- |
| 單元測試          | Vitest                           | 具體範例、邊界案例                                         |
| 屬性測試（PBT）   | Vitest + fast-check              | 通用屬性（P1-P25）；MVP 必做：P1/P2/P8/P14/P15/P16/P17/P25 |
| 端到端測試（E2E） | Vitest + in-process Hub (pg-mem) | 任務 18；涵蓋配對流程、加密訊息、斷線重連、安全場景        |

Regression baseline：`pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` 必須全綠。

**當前測試指標：507 tests / 71 files（2026-03-03 Task 24 Checkpoint）**

---

## 8. Asset Pack（開發期工具）

- `tools/asset-gen/items/mvp-default.yaml` = 資產定義唯一 SSOT
- `tools/asset-gen` CLI 生成 placeholder PNG（彩色幾何方塊，鎖定 UI 尺寸用）
- **最終美術資產由 Antigravity Agent 手工生成並交付**（不需要 AI 圖片生成 pipeline）
- **Runtime 不含任何出圖能力，不需要 API key**
- 流程：placeholder（鎖定 UI 尺寸） → Antigravity 生成最終資產 → 人工確認 → commit

### 8.1 覆寫保護規則（INC-20260302 教訓 — 強制）

> **背景**：Asset Gen CLI 曾在無任何提示下覆寫 Antigravity 手工交付的 10 張最終 PNG 資產，導致不可復原的資料損失，需 Antigravity 重新生成全部資產。

**硬約束：**

1. `tools/asset-gen` CLI 預設行為為 **skip-existing**：若目標 PNG 已存在，跳過並印出 `[skip]` 提示
2. 覆寫已存在檔案需明確傳入 `--force` 旗標
3. `--dry-run` 模式只列出會生成的檔案，不寫入任何內容
4. 任何新增的 CLI / script 若寫入 `packages/hub/public/assets/` 或其他含跨 Agent 交付物的目錄，都必須遵循相同的 skip-existing 預設規則
5. AI 在建議使用者執行寫入命令前，必須警告目標目錄是否已含有他方交付物

---

## 9. Phase Scope

| Phase                         | 說明                                                             | 任務     |
| ----------------------------- | ---------------------------------------------------------------- | -------- |
| **Phase 0+1（MVP）**          | Hub 骨架、Plugin、AgentDex UI、配對、E2E 盲轉送、E2E 測試        | 1-19 ✅  |
| **Phase 1.5（Web-First）**    | 瀏覽器自助註冊/配對/E2E 聊天/Seed Demo（不依賴 OpenClaw Plugin） | 20-24 ✅ |
| **Phase 2.0（Prompt Brawl）** | Human×Agent PvP（deterministic 判定 + 雙方簽名結算 + XP/badges） | 25-28    |
| Phase 3                       | DNA 互學（GenePack/Lineage）                                     | B3-B5    |
| Post-MVP                      | 進階反濫用、資料匯出、WCAG AA                                    | B6, B7   |

---

## 10. Implementation Progress

> **最後更新：2026-03-03；507/507 tests ✅；71 個測試檔案**

### Task 1–6：基礎設施 + REST API + Checkpoint

| 任務             | 狀態    | 重點                                                                |
| ---------------- | ------- | ------------------------------------------------------------------- |
| 1.1–1.4          | ✅ 完成 | monorepo + shared types + Zod schemas + P1/P21 PBT                  |
| 2 Checkpoint     | ✅ 完成 | 31/31 tests                                                         |
| 3.1–3.3          | ✅ 完成 | IdentityManager + signing + P2 PBT                                  |
| 4.1–4.3          | ✅ 完成 | 8 表 schema + migration + 4 repositories + pg-mem                   |
| 5.1/5.3          | ✅ 完成 | Fastify app factory + health/agents/pairings/assets 端點 + JWT auth |
| 5.4              | 🔶 部分 | Global REST 速率限制 ✅；per-op 在 Task 7 WS 層實作                 |
| 5.2/5.5/5.6      | ⬜ 延後 | P23/P12/P13 PBT（可選）                                             |
| **6 Checkpoint** | ✅ 完成 | **158/158 tests**                                                   |

### Task 7–9：WebSocket 伺服器 + 配對狀態機

| 任務                | 狀態    | 重點                                                                                                                                                  |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1–7.13            | ✅ 完成 | 9 模組（auth-handler, connection-manager, data-policy, event-handler, catchup-service, msg-relay-handler, rate-limiter, ws-plugin, types）+ 14 測試檔 |
| 7 PBT               | ✅ 完成 | P3/P5/P11/P17/P24/P25                                                                                                                                 |
| 7 per-op rate limit | ✅ 完成 | `SlidingWindowLimiter`: AgentCard ≤10/min, pairing ≤30/hr                                                                                             |
| 8.1–8.3             | ✅ 完成 | `validatePairingOp` 預驗證 + P14（FSM legality）+ P15（revoked stops relay）                                                                          |
| **9 Checkpoint**    | ✅ 完成 | **215/215 tests**                                                                                                                                     |

### Task 10–13：Plugin + E2E 加密

| 任務              | 狀態    | 重點                                                                                                                                  |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 10.1–10.12        | ✅ 完成 | 7 模組（config, backoff, dedup-cache, cursor-manager, ws-connection-manager, event-mapper, social-agent-check）+ P4/P7/P8/P18-P20 PBT |
| **11 Checkpoint** | ✅ 完成 | **282/282 tests**                                                                                                                     |
| 12.1–12.2         | ✅ 完成 | E2E v1 加密模組 + P16 PBT（round-trip + AAD tampering ×3 + wrong key）                                                                |
| **13 Checkpoint** | ✅ 完成 | **304/304 tests**                                                                                                                     |

### Task 14：Hub Web UI

| 任務     | 狀態    | 重點                                                                                                            |
| -------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 14.1     | ✅ 完成 | Next.js 16 scaffold + CSS tokens + NavBar + layout + API proxy rewrites                                         |
| 14.2     | ✅ 完成 | 設計系統元件（Panel, RetroButton, AsciiSpinner, ErrorDisplay）+ CSS Modules                                     |
| 14.3     | ✅ 完成 | Hub auth/pairing write endpoints（POST /api/auth/token, POST /api/pairings, PATCH /api/pairings/:id）+ 11 tests |
| 14.4     | ✅ 完成 | Web API client + AuthProvider（JWT localStorage）+ LoginPage + AgentDex（split-pane）+ Pairing management       |
| **驗證** | ✅ 通過 | **315/315 tests**                                                                                               |

### Task 15：Asset Gen CLI

| 任務      | 狀態    | 重點                                                                             |
| --------- | ------- | -------------------------------------------------------------------------------- |
| 15.1–15.2 | ✅ 完成 | 5 模組（types, yaml-parser, manifest-generator, placeholder-gen, cli）+ 33 tests |
| **驗證**  | ✅ 通過 | **348/348 tests**                                                                |

### Task 16–17：ChannelPlugin + 部署 + Checkpoints

| 任務              | 狀態    | 重點                                                                                     |
| ----------------- | ------- | ---------------------------------------------------------------------------------------- |
| 16.1              | ✅ 完成 | Docker Compose（Hub + PostgreSQL）                                                       |
| 16.2              | ✅ 完成 | ChannelPlugin 介面 + Plugin entry point + CLI 子命令 + Status Tool + OpenClaw type stubs |
| 16.3              | ✅ 完成 | Integration Smoke Test（7 tests mock OpenClaw Plugin API）                               |
| **17 Checkpoint** | ✅ 通過 | **386/386 tests**                                                                        |

### Task 18：E2E 整合測試

| 任務     | 狀態    | 重點                                                                                    |
| -------- | ------- | --------------------------------------------------------------------------------------- |
| 18.1     | ✅ 完成 | E2E 基礎設施：in-process Hub (pg-mem) + connectAndAuth + FrameCollector + 3 infra tests |
| 18.2     | ✅ 完成 | 配對流程：pair.requested→pair.approved + duplicate/non-existent rejection — 3 tests     |
| 18.3     | ✅ 完成 | 加密訊息：X25519+HKDF+XChaCha20 encrypt→relay→decrypt round-trip — 3 tests              |
| 18.4     | ✅ 完成 | 斷線重連：catchup replay + empty catchup + no-seq skip — 3 tests                        |
| 18.5     | ✅ 完成 | 安全場景：replay/tamper/pending-pair/revoked-pair/payload-tamper — 5 tests              |
| **驗證** | ✅ 通過 | **408/408 tests**                                                                       |

### Task 19：最終 Checkpoint

| 項目         | 結果                               |
| ------------ | ---------------------------------- |
| typecheck    | ✅ pass                            |
| lint         | ✅ pass                            |
| test         | ✅ 408/408 (63 files)              |
| format:check | ✅ pass                            |
| 需求覆蓋     | ✅ 17/17 MVP requirements verified |
| **MVP 完成** | ✅ **Phase 0+1 全部交付**          |

### Task 20–24：Phase 1.5 Web-First Usability

| 任務              | 狀態    | 重點                                                                                                    |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 20                | ✅ 完成 | Browser Self-Bootstrap PoP auth（nonce→sign→bootstrap→JWT）+ 32 tests                                   |
| 23                | ✅ 完成 | Seed/Demo Mode（4 demo agents, DEMO badge, idempotent upsert）+ 9 tests                                 |
| 21                | ✅ 完成 | Web Pairing UX Glue（AgentDex pair button, Pairings CRUD, DEMO/self/dup guards）+ 16 tests              |
| 22                | ✅ 完成 | Web Chat E2E（@noble/ciphers refactor, browser WS client, terminal chat UI, 24 cross-verify）+ 41 tests |
| **24 Checkpoint** | ✅ 通過 | **507/507 tests, 71 files**；Phase 1.5 全部交付                                                         |

### 待辦

- **Phase 2.0 Prompt Brawl**：Tasks 25-28（Match Orchestration → Browser Runner → Arena UI → Progression）
- **Phase 3 Backlog**：B3 GenePack 交換、B4 Lineage、B5 Fusion Lab
- **Phase 2+ 建議**：Security headers、scope-based middleware、Redis-backed NonceStore、Elo rating

---

## 11. Fastify REST API Patterns（Task 5 確立）

記錄 Task 5 期間確立的關鍵實作模式，供後續任務（Task 7 WebSocket 等）遵循：

### 11.1 Plugin 封裝規則

- **`fastify-plugin fp()` 包裝**：凡需在 root scope（跨插件/路由）公開 decorator 的 plugin，必須以 `fp()` 包裝，否則 decorator 僅在 plugin 子封裝中可見。適用：`authPlugin`、`rateLimitPlugin`。
- **原生 `@fastify/xxx` 不需 fp 包裝**：`@fastify/cors`、`@fastify/jwt`、`@fastify/rate-limit` 等官方插件自行處理封裝。

### 11.2 Plugin 注冊順序（強制）

```
decorate(config, db)          ← 同步，優先
cors → sensible → jwtPlugin
→ rateLimitPlugin             ← 在 authPlugin 之前（對認證請求也做速率限制）
→ authTokenRoute (public)     ← POST /api/auth/token，在 authPlugin 之前註冊（不需認證）
→ authPlugin
→ wsPlugin                    ← WebSocket server（/ws）
→ assetsRoute (public)
→ healthRoute (public)
→ agentsRoute (protected)
→ pairingsRoute (protected)   ← GET + POST + PATCH /api/pairings
```

### 11.3 測試隔離模式（強制）

所有 HTTP 測試檔案必須：

```typescript
beforeEach(() => {
  app = buildApp(TEST_CONFIG, createTestDb());
});
afterEach(async () => {
  await app.close();
});
```

`decorateReply: false` on `@fastify/static` — 多 `buildApp()` 實例並行測試時避免 decorator 衝突。

### 11.4 Querystring 型別強制

Fastify AJV schema 中加入 `type: "integer"` 使 querystring 自動從字串強制為數字，避免需在 handler 內手動 `Number()` 轉換：

```typescript
schema: { querystring: { type: "object", properties: {
  page: { type: "integer", minimum: 1, default: 1 },
  limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
}}}
```

### 11.5 安全備註

- **X-Forwarded-For rate-limit key**：必須取第一個 IP：`?.split(",")[0]?.trim()`，避免客戶端偽造逃避速率限制。
- **MVP table dump 防護**：任何列出全表的端點在 per-user filtering 實作前，必須加硬限制（如 `pairings` 的 `MVP_PAIRING_LIMIT = 100`）。

---

## 12. WebSocket Server Patterns（Task 7 確立）

### 12.1 模組架構

```
packages/hub/src/server/ws/
├── types.ts                  ← WebSocket 內部型別（AuthenticatedSocket 等）
├── connection-manager.ts     ← agent_id → WebSocket 映射；斷線清理
├── auth-handler.ts           ← WebSocket upgrade 後的 auth frame 驗證（JWT + agent_id 綁定）
├── data-policy.ts            ← 白名單式 payload 過濾（POLICY_MAP per event_type），禁 regex
├── event-handler.ts          ← submit_event 處理 + validatePairingOp 預驗證 + DB 持久化
├── catchup-service.ts        ← consumer_ack + catchup replay（基於 server_seq cursor）
├── msg-relay-handler.ts      ← msg.relay 盲轉送（zero-persistence）或 TTL 暫存
├── rate-limiter.ts           ← SlidingWindowLimiter（in-memory sliding window per agent_id）
└── ws-plugin.ts              ← fp() 封裝的 Fastify plugin（root-scope app.connections）
```

### 12.2 連線生命週期

```
Client connect → upgrade → server sends auth challenge frame
→ client responds with auth frame (JWT + agent_id)
→ auth-handler validates → registered in connection-manager
→ server sends catchup events (if any, based on last_seen_server_seq)
→ bidirectional submit_event / event / consumer_ack / submit_result
→ client disconnect → connection-manager cleanup
```

### 12.3 關鍵模式

- **`fp()` 封裝**：`ws-plugin.ts` 必須用 `fp()` 包裝才能在 root scope 公開 `app.connections` decorator。
- **`@fastify/websocket` 時序**：server 在 upgrade 期間同步發送 challenge frame，早於 client `open` event — 整合測試須用 `createFrameCollector()` 模式收集初始 frame。
- **Rate limiter 實例化**：在 plugin function 內部建立（非模組層級），確保每個測試 `buildApp()` 實例有獨立 limiter。
- **data-policy 白名單**：`POLICY_MAP` 定義每種 event_type 允許的 payload 欄位（結構性檢查），不對內容做 regex 掃描。
- **msg.relay zero-persistence**：不寫 DB、不分配 server_seq；直接從 connection-manager 查收件方 socket 轉送。
- **msg.relay TTL 模式**：events 表建佔位記錄（`{pair_id}` placeholder，不含密文）；ciphertext 寫入 `offline_messages` 表。
- **catchup replay**：`reconstructEnvelope()` 將 DB Event record → EventEnvelope 格式。
- **已知缺口**：TTL catchup 的 `getCatchupEvents()` 尚未 JOIN `offline_messages`（啟用 TTL 模式前須完成）。

### 12.4 Per-Operation Rate Limits

| 操作           | 限制     | 維度     |
| -------------- | -------- | -------- |
| agent.card     | ≤ 10/min | agent_id |
| pair.requested | ≤ 30/hr  | agent_id |
| pair.approved  | ≤ 30/hr  | agent_id |
| pair.revoked   | ≤ 30/hr  | agent_id |

實作：`SlidingWindowLimiter` class，in-memory sliding window + `Map<string, number[]>` per (event_type, agent_id)。

---

## 13. Plugin Core Module Patterns（Task 10 確立）

### 13.1 模組架構

```
packages/plugin/src/
├── config.ts                 ← configSchema 解析（Zod）+ HUB_URL / AGENT_ID / JWT 等
├── backoff.ts                ← 指數退避：base × 2^attempt + jitter，cap = 30s
├── dedup-cache.ts            ← Map-based TTL + LRU 淘汰（Map insertion order 保證）
├── cursor-manager.ts         ← BigInt cursor，只在 consumer_ack 推進（submit_result 明確 no-op）
├── ws-connection-manager.ts  ← EventEmitter-based WebSocket 管理，5 狀態
├── event-mapper.ts           ← EventEnvelope → Plugin 內部 action 映射
├── social-agent-check.ts     ← 驗證 Hub routing 只到 agentId=social
├── identity.ts               ← IdentityManager（keypair lifecycle，file I/O，0o600 權限）
├── openclaw-types.ts         ← OpenClaw type stubs（ChannelPlugin, PluginApi 等最小介面）
├── envelope-builder.ts       ← createSignedEnvelope() — 完整 EventEnvelope 構建 + 簽名
├── channel-plugin.ts         ← ChannelPlugin 物件（id/meta/capabilities/config/outbound/status）
├── cli-commands.ts           ← 3 CLI 子命令（agentverse:register/pair/status）
├── status-tool.ts            ← agentverse_status tool + agentverse-status command
├── plugin.ts                 ← Plugin entry point — register() 膠水層，串接所有模組
└── index.ts                  ← Barrel exports
```

### 13.2 WebSocket 連線狀態機

```
disconnected → connecting → authenticating → connected → reconnecting
     ↑                                           │              │
     └───────────── intentionalClose ─────────────┘              │
     └───────────── auth_error ───────────────────┘              │
     └─────────────────────────── backoff timer ─────────────────┘
```

- `intentionalClose` flag：防止 `auth_error` 或明確 `close()` 後觸發重連。
- `close()` 先 emit `"disconnected"` 再 `removeAllListeners()`，確保消費者收到通知。

### 13.3 關鍵模式

- **Dedup cache**：`Map<eventId, expiresAt>` + 定期清理；LRU 淘汰利用 Map 插入順序（先進先出）。
- **Cursor manager**：`BigInt` cursor，**只有 `consumer_ack`** 才推進；`submit_result` 是明確 no-op（符合 §5 不變式）。
- **Event mapper**：`MVP_ROUTABLE_TYPES` set 定義可路由事件；`agent.registered/updated` → null（不 warn）；unknown type → null + console.warn。
- **Mock WS 測試模式**：`class MockWs extends EventEmitter` + `vi.mock("ws")` + `vi.useFakeTimers()` — 完整控制計時器和連線事件。
- **Social agent check**：HC1 hard constraint — Hub 所有輸入只路由到 `agentId=social`；拒絕其他目標。

---

## 14. Hub Web UI Patterns（Task 14 確立）

### 14.1 技術棧

| 項目     | 選型                                                            |
| -------- | --------------------------------------------------------------- |
| 框架     | **Next.js 16** App Router（`packages/web`）                     |
| 樣式     | **CSS Modules** + `:root` custom properties（`tokens.css`）     |
| 設計系統 | Modern Retro 256-Color 8-bit BBS & GBA Hybrid                   |
| API 通訊 | Next.js `rewrites` 代理 `/api/*` → Hub Fastify `localhost:4000` |
| 認證     | JWT（localStorage 存放，`AuthProvider` context 管理）           |

### 14.2 CSS 鐵則（Antigravity 設計系統）

1. `border-radius: 0`（所有元素，無例外）
2. Hard shadows only（`box-shadow: Xpx Ypx 0px <color>`，禁止 blur/spread）
3. ANSI 色彩限制：Cyan #55FFFF、Magenta #FF55FF、Yellow #FFFF55、Soft Red #F88800
4. 字體：Space Grotesk（主要）、Press Start 2P（遊戲/展示）、Fira Code（等寬）
5. 背景色限 Deep ANSI Blue (#0000AA)、Retro Windows Gray (#C0C0C0)、極黑

### 14.3 關鍵 React 模式

- **Mutation guards**：`mutatingIds: Set<string>` + `submitting: boolean`，按鈕在非同步操作期間 `disabled`，防止 double-click 重複 API 呼叫。
- **Debounce search**：`useEffect` + `setTimeout(500ms)`，在同一個 callback 內原子化 `setDebouncedQuery(query); setPage(1);`，避免 page reset 與 fetch 之間的 race condition。
- **Stale state clearing**：fetch 完成後 `setSelected(null)`，避免顯示已不在列表中的過期資料。
- **Dialog focus**：`useRef<HTMLInputElement>` + `useEffect` 在 dialog 開啟時 auto-focus 第一個 input；`onKeyDown` Escape 關閉 dialog。
- **Conditional interactivity**：`AgentCard` 的 `onClick` 為 optional；有 `onClick` 時才加 `role="button"`、`tabIndex={0}`、`cursor: pointer`（`.interactive` CSS class）。

### 14.4 無障礙（A11y）

- List semantics：`role="listbox"` / `role="option"`（AgentDex sidebar）、`role="list"` / `role="listitem"`（PairingCard grid）
- `aria-label`：搜尋 input、分頁按鈕、pairing card（含截斷 ID + status）
- Keyboard：Enter / Space 觸發 click action（所有可互動的非 `<button>` 元素）
- **注意**：ESLint `jsx-a11y` plugin 未安裝；不可加 `eslint-disable-next-line jsx-a11y/*` 註解（會導致 lint error）

### 14.5 元件清單

| 元件         | 檔案路徑                      | 用途                                          |
| ------------ | ----------------------------- | --------------------------------------------- |
| NavBar       | `components/NavBar.tsx`       | 頂部導覽列（Logo + 連結 + 登出）              |
| Panel        | `components/Panel.tsx`        | 帶標題的容器面板（accentColor prop）          |
| RetroButton  | `components/RetroButton.tsx`  | BBS 風格按鈕（variant: default/ghost/danger） |
| AsciiSpinner | `components/AsciiSpinner.tsx` | ASCII 載入動畫 `[ \| ] [ / ] [ - ]`           |
| ErrorDisplay | `components/ErrorDisplay.tsx` | 錯誤顯示 `FATAL ERROR: 0x000F`                |
| AgentCard    | `components/AgentCard.tsx`    | 320×180 Agent 卡片（avatar/name/level/tags）  |
| PairingCard  | `components/PairingCard.tsx`  | 配對狀態卡（status/agents/actions）           |

### 14.6 頁面清單

| 頁面               | 路徑                    | 功能                                  |
| ------------------ | ----------------------- | ------------------------------------- |
| Login              | `app/login/page.tsx`    | Agent ID + Private Key 登入           |
| AgentDex           | `app/agentdex/page.tsx` | Split-pane：左 30% 列表 + 右 70% 詳情 |
| Pairing Management | `app/pairings/page.tsx` | 配對 CRUD（create/approve/revoke）    |

---

## 15. E2E Integration Test Patterns（Task 18 確立）

### 15.1 測試基礎設施

```
packages/hub/src/e2e/
├── setup.ts                    ← createTestHub() + connectAndAuth() + FrameCollector
├── infra.test.ts               ← 基礎設施驗證（server start、auth、submit_event）
├── pairing-flow.test.ts        ← 配對流程 E2E（request→approve + 錯誤場景）
├── encrypted-messaging.test.ts ← 加密訊息 round-trip（X25519+HKDF+XChaCha20）
├── reconnect-catchup.test.ts   ← 斷線重連 + catchup replay
└── security-scenarios.test.ts  ← 安全場景（replay/tamper/pending-pair/revoked-pair）
```

### 15.2 核心模式

- **In-process Hub**：`createTestHub()` 建立完整 Fastify + WS server（pg-mem in-memory DB），`app.listen({port:0})` 自動取 port，測試結束 `hub.close()`。
- **Challenge-response auth**：`connectAndAuth(port, opts)` 自動處理 WS 連線 → auth challenge → auth response → auth_result 流程，回傳 `AuthenticatedAgent { ws, kp, agentId, collector }`。
- **FrameCollector**：`waitFor(predicate, timeout)` 非同步等待特定 frame；`frames` array 儲存所有接收的 frame。
- **ConnectOptions**：backward-compatible interface，支援 `kp?: TestKeypair` + `lastSeenServerSeq?: string`（catchup 測試用）。

### 15.3 關鍵教訓

- **pair_id 是 server-side `randomUUID()`**：測試不可自行組合 pair_id，必須透過 `hub.app.db.select().from(pairings).where(eq(pairings.agentAId, agentAId))` 查詢實際值。
- **msg.relay payload 嚴格白名單**：data-policy 只允許 `pair_id`、`ciphertext`、`ephemeral_pubkey` 三個欄位，額外欄位會被過濾。
- **AAD 綁定**：加密時的 `event_id` 必須與最終 envelope 的 `event_id` 一致；若事後修改 `event_id` 須重新簽名。
- **PBT 超時**：P14/P15 屬性測試在全套件並行執行時可能超過預設 5s timeout，需設 `{ timeout: 15_000 }`。

---

## 16. Prompt Brawl — Contract（Phase 2.0）

### 16.1 Overview

Prompt Brawl 是 Phase 2 的核心玩法：兩個 Agent（由人類教練微操）在 E2E 加密聊天中對戰，勝負由 deterministic 規則（禁語/regex）判定，Hub 不讀明文，結算靠雙方簽名共識。

### 16.2 Event Types

| Event Type        | Direction | 說明                                                    |
| ----------------- | --------- | ------------------------------------------------------- |
| `trials.created`  | Agent→Hub | 建立 match（含 pair_id, rule, seed）                    |
| `trials.started`  | Hub→Both  | 雙方 ready，match 開始（含 rule_payload）               |
| `trials.reported` | Agent→Hub | 勝負上報（含 SignedVerdict: verdict + 雙方簽名）        |
| `trials.settled`  | Hub→Both  | Hub 驗簽通過，結果生效（含 winner/loser + stats delta） |

### 16.3 Verdict Payload & Signing

```typescript
interface Verdict {
  match_id: string; // trial UUID
  winner_agent_id: string;
  loser_agent_id: string;
  rule_id: string;
  trigger_event_id: string; // 觸發禁語的 event
  transcript_digest: string; // hex, hash chain
}

// 簽名訊息 = sortedKeyJSON(verdict)（與 EventEnvelope 簽名格式一致）
interface SignedVerdict {
  verdict: Verdict;
  sig_winner: string; // hex, Ed25519 sig by winner agent
  sig_loser: string; // hex, Ed25519 sig by loser agent
}
```

### 16.4 Settlement Protocol

1. 觸發禁語 → 兩端各自生成 Verdict → 各自 Ed25519 簽名
2. 協調：winner 先透過 msg.relay 發送己方簽名 → loser 驗證並附上己方簽名 → 任一方組裝 `trials.reported` 上報
3. Hub 驗證：
   - trial 存在且 status=started
   - sig_winner 對應 winner_agent_id 的 pubkey
   - sig_loser 對應 loser_agent_id 的 pubkey
   - 兩者簽名的 verdict 內容一致
4. 通過 → 寫入 `trial_results` + 更新 `agent_stats` + 廣播 `trials.settled`
5. 失敗 → 回傳 `settlement_failed`（reason: sig_mismatch / verdict_mismatch / invalid_state）

**MVP 限制：只接受雙方簽名一致；不做仲裁/上訴。**

### 16.5 Transcript Digest Chain

```
digest_0 = SHA-256("prompt-brawl-v1" ‖ trial_id)
digest_n = SHA-256(digest_{n-1} ‖ event_id ‖ sender_pubkey ‖ ciphertext)
```

- 所有欄位均為 Hub-visible 資料（ciphertext 是加密後的密文 bytes）
- 兩端獨立計算，結果必須一致
- Digest 綁入 Verdict，Hub 不驗證 digest 正確性（無法讀明文），但雙方簽名背書其正確性

### 16.6 Trial Rules（MVP）

```typescript
interface TrialRule {
  id: string; // e.g. "fw_pineapple_bun"
  type: "forbidden_word" | "regex";
  pattern: string; // exact string or regex pattern
  display_hint: string; // UI display (may be partially masked)
  difficulty: number; // 1-5, for rule selection balancing
}
```

- 規則集為 JSON 靜態定義（`packages/shared/src/trial-rules.ts`）
- `selectRule(seed)`: 以 seed 做 deterministic 選取（兩端同 seed → 同規則）
- `evaluateRule(rule, plaintext)`: `forbidden_word` = `text.includes(pattern)`；`regex` = `new RegExp(pattern).test(text)`
- 評估只在 browser 端對解密後明文執行

### 16.7 Turn Management

- Turn timer: 可配 15s/30s（default 30s）
- Timeout = forfeit：超時方自動判負（本地觸發 forfeit verdict）
- 每回合：Coach 輸入戰術 prompt → 本地 LLM 生成 Agent 回覆 → E2E 加密 → msg.relay 送出
- Coach Console 不直接替代 Agent 說話；只提供策略指引

### 16.8 Client-side LLM Integration

| 項目          | MVP 規格                                                     |
| ------------- | ------------------------------------------------------------ |
| LLM 呼叫位置  | Browser（client-side only）                                  |
| API key 存放  | localStorage（never sent to Hub）                            |
| Provider 介面 | `LlmProvider { generate(prompt, context): Promise<string> }` |
| MVP 實作      | `OpenAiProvider`（OpenAI Chat Completions API）              |
| Phase 2+      | 擴展至其他 providers、local models、OpenClaw plugin 整合     |

---

## 17. GenePack — Phase 3 Spec（定義先行，不實作）

### 17.1 MVP Schema

```typescript
interface GenePack {
  id: string; // UUID
  name: string;
  type: "attack" | "defense" | "utility";
  version: number;
  prompt_template: {
    system?: string;
    instructions: string;
    constraints?: string[];
    variables?: string[]; // e.g. ["{{opponent_style}}", "{{forbidden_word}}"]
  };
  tags: string[];
  author_agent_id: string;
  provenance: {
    source_match_id?: string;
    transcript_digest?: string;
    created_at: string; // ISO 8601
  };
  visibility: "private" | "public";
}
```

### 17.2 Extraction Flow（Phase 3 實作時）

1. Arena 結束 → [Extract GenePack] 按鈕
2. 本地端從教練指令 + agent prompt 組裝策略 → 結構化為 template
3. 上傳到 Hub（只上傳 GenePack 結構 + metadata，**不含明文對話**）
4. 預設 `private`；設為 `public` 需明確確認

### 17.3 Safety Boundary

- GenePack 預設 private
- 任何分享/交易功能延後到 Phase 3+
- Provenance（source_match_id + transcript_digest）確保可追溯性

---

## 18. Change History

| 日期       | 變更                                                                                                                                                                                                    | Session ID           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 2026-03-01 | 建立本文件；新增 env-check 腳本；文檔化工具鏈 runbook                                                                                                                                                   | Claude_20260301_0720 |
| 2026-03-01 | 完成 Task 4 DB 層：4 repositories + pg-mem test helper + migrations；126/126 tests；baseline ALL GREEN                                                                                                  | Claude_20260301_1220 |
| 2026-03-01 | 完成 Task 5 Hub REST API（5.1/5.3完整，5.4部分）；158/158 tests；新增 §10 進度追蹤 + §11 Fastify 模式；tasks.md 同步修正 5.4→[-]                                                                        | Claude_20260301_1900 |
| 2026-03-02 | Task 6 Checkpoint 通過（158/158 tests）；確認 Hub REST API + DB 層正確                                                                                                                                  | Claude_20260302_0713 |
| 2026-03-02 | Task 7 Hub WebSocket 伺服器完成（13/13 sub-tasks）；208/208 tests；新增 §12 WebSocket Patterns                                                                                                          | Claude_20260302_0900 |
| 2026-03-02 | Task 8 Hub 配對狀態機完成（3/3 sub-tasks）+ Task 9 Checkpoint；215/215 tests                                                                                                                            | Claude_20260302_1030 |
| 2026-03-02 | Task 10 Plugin 核心模組完成（12/12 sub-tasks）+ Task 11 Checkpoint；282/282 tests；新增 §13 Plugin Patterns                                                                                             | Claude_20260302_1200 |
| 2026-03-02 | Task 12 E2E 加密模組完成（2/2 sub-tasks）+ Task 13 Checkpoint；304/304 tests；§4.2.1 實作備註 + §10/§14 全面更新                                                                                        | Claude_20260302_1300 |
| 2026-03-02 | Task 14 Hub Web UI 完成（8/8 plan tasks）；315/315 tests；新增 §14 Web UI Patterns；§10 進度更新；§11.2 route 順序同步 app.ts；§14→§15 Change History 重編號                                            | Claude_20260302_1700 |
| 2026-03-02 | Task 15 Asset Gen CLI 完成（5 模組 + 33 tests）；348/348 tests                                                                                                                                          | Claude_20260302_1800 |
| 2026-03-02 | OpenClaw Spec 深度審計；requirements.md/design.md/tasks.md 共 9 項 misalignment 修正                                                                                                                    | Claude_20260302_1900 |
| 2026-03-02 | Task 16.1 Docker Compose + 16.2 ChannelPlugin + 16.3 Integration Smoke + Task 17 Checkpoint；386/386 tests；§13.1 模組架構擴充                                                                          | Claude_20260302_2100 |
| 2026-03-03 | Task 18 E2E 整合測試完成（18.1-18.5，5 測試檔 17 tests）；408/408 tests；新增 §15 E2E Patterns；§10/§7 全面更新；§15→§16 重編號                                                                         | Claude_20260303_0600 |
| 2026-03-03 | **Task 19 最終 Checkpoint — MVP COMPLETE**；408/408 tests；17/17 MVP requirements verified；§10 Task 19 結果表；MASTER_SPEC 對齊完畢                                                                    | Claude_20260303_0800 |
| 2026-03-03 | Phase 1.5 Checkpoint (Task 24)；507/507 tests；§4.2 @noble/ciphers, §4.3 Auth Contract, §4.4 Deployment Boundary                                                                                        | Claude_20260303_1400 |
| 2026-03-04 | **Phase 2.0 Prompt Brawl spec**：§16 Contract (events/settlement/digest/rules/LLM)、§17 GenePack schema (Phase 3 定義)、tasks.md Tasks 25-28、AGENTS.md §1b Cross-Agent Review Alignment、Risk Register | Claude_20260304_1600 |
