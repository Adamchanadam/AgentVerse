# 實作計畫：AgentVerse（Phase 0+1 MVP）

## 概覽

本計畫將 AgentVerse 設計拆解為可遞增執行的編碼任務，聚焦 Phase 0+1（MVP）交付。任務按依賴順序排列：先建立 monorepo 骨架與共用型別，再實作 Hub 後端、Plugin 核心、E2E 加密、UI，最後以端到端整合測試收尾。Phase 2/3 任務列於末尾作為 backlog。

語言：TypeScript（全棧）
測試框架：Vitest + fast-check（屬性測試）
資料庫：PostgreSQL（自託管預設）

---

## 硬約束（開工前必讀）

### Repo 分離與 openclaw-main 只讀原則

1. **`openclaw-main/` 為只讀參考**：禁止直接修改上游代碼；如需 patch 上游，另開獨立 PR 到 openclaw/openclaw
2. **AgentVerse 新代碼獨立目錄**：所有新代碼位於 monorepo 根目錄（`packages/`、`tools/`、`tests/`），日後發佈為獨立 GitHub repo
3. **集成測試僅用掛載/符號連結**：任務 16.2 的 mount 腳本將 `packages/plugin` 的 build output 映射到 `openclaw-main/extensions/agentverse`，**不得在 `openclaw-main/` 內直接寫源碼**
4. **Git hygiene**：`openclaw-main/` 加入 AgentVerse repo 的 `.gitignore`（或以 git submodule/外部 clone 方式引用），避免 commit 上游代碼/大檔案導致體積爆炸與版權混亂
5. **Pre-commit / CI gate**：設定 pre-commit hook（或 CI step），若偵測到任何變更路徑落在 `openclaw-main/` 內，直接 fail 並提示「openclaw-main 為只讀參考，禁止直接修改」
6. **Mount script 保護**：mount 腳本執行前先檢查 `openclaw-main/` 是否有工作樹變更（`git -C openclaw-main status --porcelain`）；若有未提交變更則中止並提示「上游只讀，請先還原或 stash」

### TTL 模式 server_seq 一致性（全域 cursor 不變式）

TTL 模式下 msg.relay 仍消耗同一條 `server_seq`：Hub 在 events 表建立一條**佔位記錄**（event_type=msg.relay、pair_id、sender_pubkey，**不含密文**），`offline_messages` 表以同一 `server_seq` 連結並儲存密文（`server_seq` 欄位以 FK 參考 `events(server_seq)`，DEFERRABLE INITIALLY DEFERRED，確保不出現孤兒記錄）。catchup 查詢以 events 表的 server_seq 為唯一 cursor 來源，offline_messages 僅作密文 payload 的 JOIN 補充。此設計確保全域 cursor 語義不因 msg.relay 持久化模式而分裂。

### 屬性測試分級

屬性測試分為兩級：

**MVP 必做（不可跳過，標記為 `[ ]` 非可選）：**

- P1: Event Envelope 序列化 Round-Trip（任務 1.3）
- P2: 簽名篡改偵測（任務 3.3）
- P8: Cursor 僅由 consumer_ack 驅動推進（任務 10.7）
- P14: 配對狀態機合法性（任務 8.2）
- P15: 撤銷後停止訊息轉送（任務 8.3）
- P16: E2E 加密 Round-Trip（任務 12.2）
- P17: 盲轉送——Hub 無明文（任務 7.13）
- P25: msg.relay catchup 語義（任務 7.12）

**可延後（標記為 `[ ]*` 可選，趕工時可暫緩）：**

- P3/P4: 事件冪等性（任務 7.8, 10.5）
- P5: server_seq 單調遞增（任務 7.9）
- P6: configSchema 驗證（任務 1.5）
- P7: 指數退避重連（任務 10.3）
- P9/P10: Private Key / Key Rotation（任務 3.4, 3.5）
- P11: 資料最小化（任務 7.10）
- P12: 速率限制（任務 5.5）
- P13: AgentDex 搜尋（任務 5.6）
- P18/P19/P20: Social Agent 路由/映射/未知事件（任務 10.9, 10.10, 10.11）
- P21: 反序列化錯誤報告（任務 1.4）
- P22: Events 表 Append-Only（任務 4.2）
- P23: 環境變數配置（任務 5.2）
- P24: 簽名驗證後才接受 AgentCard（任務 7.11）

### Web UI 專案位置（定案）

- `packages/hub`：Fastify + WebSocket + DB（純 server）
- `packages/web`：Next.js（純前端，可 static export 或 standalone）
- Docker Compose 以兩個服務跑（hub + web），避免 Next build 混進 hub runtime

---

## 任務

- [-] 1. 建立 Monorepo 骨架與共用型別
  - [x] 1.1 初始化 monorepo 結構（pnpm workspace）✅ verified
    - 建立頂層 `pnpm-workspace.yaml`
    - 建立 packages：`packages/shared`、`packages/hub`、`packages/plugin`、`packages/web`、`packages/trials-runner`（空殼）、`tools/asset-gen`
    - 設定 TypeScript project references、共用 `tsconfig.base.json`
    - 設定 ESLint + Prettier 共用配置
    - 設定 Vitest 共用配置（含 fast-check 依賴）
    - _需求：23.1, 23.4_

  - [x] 1.2 定義共用型別與 Event Envelope schema（`packages/shared`）
    - 實作 `EventEnvelope`、`EventType`、`EventPayload` 及所有 MVP payload 介面（AgentCardPayload、PairRequestedPayload、PairApprovedPayload、PairRevokedPayload、MsgRelayPayload）
    - 實作 `WsFrame` 聯合型別（含 submit_event、challenge、auth、auth_ok、event、submit_result、consumer_ack、catchup_start、catchup_end、ping、pong、error）
    - 實作 `SubmitResultFrame`、`ConsumerAckFrame` 介面
    - **注意：`submit_event` frame（Plugin→Hub 提交）不攜帶 `server_seq`；`server_seq` 僅出現在 Hub→接收方的 `event` frame 中。Plugin 提交時使用 `{ type: "submit_event", payload: EventEnvelope }` 與 Hub 下發的 `{ type: "event", payload: EventEnvelope, server_seq }` 為不同 frame type**
    - 實作 JSON schema 驗證函式（使用 Ajv 或 Zod）
    - 實作 Event Envelope 序列化/反序列化工具函式
    - 實作 pretty-printer 函式
    - _需求：4.1, 25.1, 25.2, 25.3, 25.4_

  - [x] 1.3 撰寫 Event Envelope round-trip 屬性測試（MVP 必做）
    - **Property 1: Event Envelope 序列化 Round-Trip**
    - 使用 fast-check 隨機產生合法 EventEnvelope 物件，驗證 serialize → deserialize 等價
    - **驗證：需求 25.2**

  - [x] 1.4 撰寫反序列化錯誤報告屬性測試 ✅ verified
    - **Property 21: 反序列化錯誤報告**
    - 使用 fast-check 隨機產生不符合 schema 的 payload，驗證回傳描述性錯誤含欄位路徑
    - **驗證：需求 25.4**

  - [ ] 1.5 撰寫 configSchema 驗證屬性測試
    - **Property 6: configSchema 驗證拒絕無效配置**
    - 使用 fast-check 隨機產生包含未知 key、型別錯誤、必填缺失的配置物件，驗證拒絕並回傳描述性錯誤
    - **驗證：需求 1.3**

- [x] 2. Checkpoint — 確認共用型別與序列化正確 ✅ verified
  - 確保所有測試通過，若有疑問請詢問使用者。

- [-] 3. 實作身份管理與事件簽名（`packages/shared` + `packages/plugin`）
  - [x] 3.1 實作 IdentityManager 模組 ✅ verified
    - 首次啟動自動生成 Ed25519 keypair 並安全儲存於 `~/.openclaw/agentverse/identity.key`
    - 與 OpenClaw device identity 分離儲存
    - 實作 `ensureKeypair()`、`getPublicKey()`、`sign()`、`rotateKeypair()`
    - 確保 private key 永不出現在任何對外傳送的資料中
    - _需求：3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 實作 EventSigningService 模組 ✅ verified
    - 對 `event_id + event_type + ts + nonce + payload_hash` 進行簽名
    - 實作簽名驗證函式（Hub 端與 Plugin 端共用）
    - _需求：4.2, 4.3_

  - [x] 3.3 撰寫簽名篡改偵測屬性測試（MVP 必做）✅ verified
    - **Property 2: 簽名篡改偵測**
    - 使用 fast-check 隨機產生已簽名事件，隨機篡改一個欄位，驗證簽名驗證失敗
    - **驗證：需求 4.2, 4.3**

  - [ ] 3.4 撰寫 Private Key 永不離開本地屬性測試
    - **Property 9: Private Key 永不離開本地**
    - 使用 fast-check 隨機產生各種 frame 類型，驗證序列化後不包含 private key 的任何表示形式
    - **驗證：需求 3.4**

  - [ ] 3.5 撰寫 Key Rotation 使舊 Session 失效屬性測試
    - **Property 10: Key Rotation 使舊 Session 失效**
    - 產生 keypair → 簽名事件 → rotate → 驗證舊簽名被拒絕
    - **驗證：需求 3.3**

- [x] 4. 實作 Hub 資料庫層（`packages/hub`）
  - [x] 4.1 建立 PostgreSQL migration 腳本 ✅ verified
    - 建立 owners、agents、pairings、events（append-only, bigserial server_seq）、gene_packs（空殼）、lineage_events（空殼）、trials_reports（空殼）表
    - 建立 offline_messages 表（TTL 模式可選）：**`server_seq` 欄位以 FK 參考 `events(server_seq)`（DEFERRABLE INITIALLY DEFERRED，允許同一 transaction 先 INSERT events 再 INSERT offline_messages）；TTL 模式下 msg.relay 仍在 events 表建立佔位記錄（不含密文），offline_messages 以同一 server_seq 連結並儲存密文；FK 確保不會出現孤兒記錄**
    - events 表加入 INSERT-only 約束（DB trigger 或 application-level check）
    - 建立必要索引（agents.pubkey UK、events.event_id UK、offline_messages catchup 索引 `WHERE expires_at > NOW()`）
    - 使用 migration 工具（如 node-pg-migrate 或 drizzle-kit）
    - _需求：12.1, 12.2, 12.3, 12.4_
    - **實作**：drizzle-kit + `drizzle/0000_smart_wendigo.sql`（8 tables）+ `drizzle/0001_append_only_events.sql`（DB trigger）

  - [x] 4.2 撰寫 Events 表 Append-Only 屬性測試 ✅ verified
    - **Property 22: Events 表 Append-Only**（P22 為可延後；application-level 已驗證）
    - 驗證 INSERT 成功、UPDATE/DELETE 被拒絕（透過 DB trigger 或 application-level 檢查）
    - **驗證：需求 12.3**
    - **實作**：`EventRepository` 無 update/delete 方法（application-level）；`event.repository.test.ts` append-only enforcement 測試組（10 tests）

  - [x] 4.3 實作資料存取層（Repository pattern）✅ verified
    - AgentRepository：CRUD AgentCard metadata
    - PairingRepository：配對狀態查詢與更新
    - EventRepository：append-only 事件寫入、server_seq 分配、catchup 查詢
    - OfflineMessageRepository：TTL 密文暫存（可選模式）
    - _需求：12.1, 12.2, 12.3, 12.4_
    - **實作**：4 repositories + pg-mem test helper（`wrapPoolForPgMem`）；初始 126 tests ✅；任務 5 期間 `AgentRepository` 新增 `findPaginated(query, limit, offset)` + `countPublic(query?)` 方法（並增測試），目前 **158/158 tests** ✅

- [-] 5. 實作 Hub Fastify REST API（`packages/hub`）
  - [x] 5.1 建立 Fastify 伺服器骨架與環境變數配置
    - 載入環境變數（DB 連線、WS 埠、速率限制閾值、MSG_RELAY_TTL_DAYS 等）
    - 設定 CORS、JSON body parser、error handler
    - 實作 `/api/health` 健康檢查端點（連線數、事件率、錯誤率）
    - _需求：11.1, 23.3, 23.4_
    - **實作備註**：`buildApp(config, db)` 工廠函式（DI pattern）；`parseEnv()` 採 `requireInt()` helper（含 NaN guard + min/max 範圍）；plugin 以 `fastify-plugin fp()` 包裝確保 root-scope decorator 可見（`authPlugin`, `rateLimitPlugin`）；WS 埠與 HTTP 埠共用（Fastify HTTP + `@fastify/websocket` 同埠，Task 7 實作時對齊）；`/api/health` 目前回傳 placeholder `connectedClients:0`，Task 7 WebSocket 完成後補充。

  - [ ] 5.2 撰寫環境變數配置屬性測試
    - **Property 23: 環境變數配置**
    - 驗證所有必要配置參數都有對應環境變數
    - **驗證：需求 23.4**

  - [x] 5.3 實作 REST API 端點
    - `GET /api/agents`（分頁、搜尋、篩選）
    - `GET /api/agents/:id`
    - `GET /api/pairings`
    - `GET /api/assets/:pack/*`（靜態資產包讀取）
    - 實作 session 認證中介層（cookie/JWT，用於 Web UI）
    - _需求：11.1, 11.3, 6.2, 6.3_
    - **實作備註**：認證採用 Bearer JWT（`@fastify/jwt`），以 `preHandler: app.authenticate` 保護 `/api/agents`、`/api/agents/:id`、`/api/pairings`；`/api/health`、`/api/assets/:pack/*` 為公開端點（無需 auth）。Cookie-based session auth 為 Web UI 登入流程（任務 14.4）所需，Task 5 不含，已延後。`GET /api/assets/:pack/*` 同時預先完成任務 15.1 中的 Hub 靜態資產路由部分（manifest.json + mvp-default pack）。

  - [-] 5.4 實作速率限制中介層
    - 可配置閾值（透過環境變數）
    - AgentCard 更新：每 agent_id 每分鐘 ≤ 10 次
    - 配對請求：每 agent_id 每小時 ≤ 30 次
    - REST API 通用速率限制
    - 超限回傳 `rate_limit_exceeded` + `retry_after`
    - _需求：5.4, 7.7, 11.4_
    - **實作（Task 5 完成部分）**：`@fastify/rate-limit`（global: true）+ `RATE_LIMIT_MAX` env var + `rate_limit_exceeded`/`retry_after` 錯誤格式 ✅；**已完成（Task 7 實作）**：AgentCard 更新每 agent_id ≤10/min、配對請求每 agent_id ≤30/hr → `SlidingWindowLimiter` in `ws-plugin.ts`

  - [ ] 5.5 撰寫速率限制屬性測試
    - **Property 12: 速率限制**
    - 使用 fast-check 隨機產生請求序列，驗證超限請求被拒絕
    - **驗證：需求 5.4, 7.7, 11.4**

  - [ ] 5.6 撰寫 AgentDex 搜尋結果匹配屬性測試
    - **Property 13: AgentDex 搜尋結果匹配**
    - 使用 fast-check 隨機產生 AgentCard 集合與搜尋關鍵字，驗證回傳結果皆符合查詢條件
    - **驗證：需求 6.2, 6.3**

- [x] 6. Checkpoint — 確認 Hub REST API 與資料庫層正確 ✅ verified
  - 確保所有測試通過，若有疑問請詢問使用者。
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 158/158 ✅ format:check ✅
  - **已確認**：Task 4 全部完成（schema 8 tables + migrations + append-only trigger + 4 repositories）；Task 5 核心完成（env config + 4 REST endpoints + auth + global rate limit）；3 項 optional PBT + per-op rate limits 已正確延後
  - **已知 minor gap**：offline_messages.server_seq FK 缺少 DEFERRABLE INITIALLY DEFERRED（drizzle 限制，impact LOW，app 層已遵守 insert 順序）

- [x] 7. 實作 Hub WebSocket 伺服器（`packages/hub`）
  - [x] 7.1 實作 WebSocket 連線握手與認證
    - 實作 challenge-response 認證流程（nonce → sig(nonce) → 驗證 pubkey）
    - 查找/建立 agent 記錄
    - 回傳 auth_ok 或 auth_error
    - _需求：2.2, 11.2, 11.3_

  - [x] 7.2 實作事件接收、驗證與分發
    - 接收 `submit_event` frame（Plugin 提交，**不含 server_seq**）
    - 驗證事件簽名（Property 2 對應邏輯）
    - 事件冪等性檢查（seen_event_id 快取，時間窗 + LRU）
    - 分配 server_seq（bigserial 單調遞增）
    - 寫入 events 表（append-only）
    - 回傳 `submit_result` frame 給發送方（含 server_seq + event_id + status）
    - 推送 `event` frame 給接收方（含 server_seq）
    - **注意：Plugin 提交的 `submit_event` frame 與 Hub 下發的 `event` frame 為不同 frame type，前者不含 server_seq**
    - _需求：4.3, 4.4, 4.6, 11.2_

  - [x] 7.3 實作 consumer_ack 處理與 cursor 管理
    - 接收 consumer_ack frame
    - 更新接收方的 last_seen_server_seq cursor
    - **關鍵不變式：cursor 僅由 consumer_ack 驅動推進，submit_result 不影響任何 cursor**
    - _需求：2.6, 2.7_

  - [x] 7.4 實作斷線補發（catchup）機制
    - 連線握手時若提供 last_seen_server_seq，啟動 catchup
    - 發送 catchup_start → 逐筆補發 (last_seen_server_seq, +∞) 範圍事件 → catchup_end
    - **catchup-eligible 事件集（MVP）：agent.registered、agent.updated、pair.requested、pair.approved、pair.revoked；msg.relay 僅在 TTL 模式下從 offline_messages 表補發未過期密文**
    - 按 server_seq 嚴格遞增順序補發
    - 等待每筆事件的 consumer_ack 後再補發下一筆（或批次補發 + 批次 ack）
    - _需求：2.5, 2.6_

  - [x] 7.5 實作 Hub 端資料政策違規檢查（data_policy_violation）
    - 對所有提交事件的 payload 進行禁止項掃描
    - **使用 schema/whitelist 結構性檢查，不使用全文正則（避免誤判與維護困難）**：定義允許的 payload 結構（每個 event_type 對應的 JSON schema），拒絕包含未定義欄位的 payload；對字串欄位設定最大長度限制；對已知禁止模式（如路徑分隔符 `/`、`\` 出現在非預期欄位）使用結構性規則而非正則
    - 違規時回傳 `data_policy_violation` 錯誤，包含違規欄位路徑
    - _需求：5.5, 10.1, 10.2, 10.3_

  - [x] 7.6 實作 msg.relay 盲轉送邏輯
    - 驗證發送方簽名 + 配對狀態為 active
    - 零落地模式（預設）：不寫入任何表，不分配 server_seq，直接轉送；**catchup 不包含零落地的 msg.relay**
    - TTL 模式（可選）：**先在 events 表建立佔位記錄（event_type=msg.relay、pair_id、sender_pubkey，不含密文）以消耗 server_seq**，再將密文寫入 offline_messages 表（以同一 server_seq 連結），設定 expires_at；catchup 時以 events 表 server_seq 為 cursor，JOIN offline_messages 取密文
    - 回傳 submit_result 給發送方
    - 推送 event frame 給接收方（若在線）
    - _需求：8.3, 8.4, 8.5, 10.4_

  - [x] 7.7 實作 ping/pong 心跳機制
    - 定期 ping/pong 偵測連線存活
    - _需求：2.1_

  - [x] 7.8 撰寫事件冪等性（Hub 端）屬性測試
    - **Property 3: 事件冪等性（Hub 端）**
    - 使用 fast-check 隨機產生事件，重複提交 N 次，驗證系統狀態與僅處理一次時相同
    - **驗證：需求 4.4**

  - [x] 7.9 撰寫 server_seq 單調遞增屬性測試
    - **Property 5: server_seq 單調遞增與事件排序**
    - 使用 fast-check 隨機產生事件序列，驗證分配的 server_seq 嚴格單調遞增
    - **驗證：需求 4.6, 2.6, 21.4**

  - [x] 7.10 撰寫資料最小化屬性測試
    - **Property 11: 資料最小化——禁止項拒絕**
    - 使用 fast-check 隨機產生包含/不包含禁止項的 payload，驗證包含禁止項時被拒絕
    - **驗證：需求 5.5, 10.1, 10.2, 10.3, 12.4**

  - [x] 7.11 撰寫簽名驗證後才接受 AgentCard 屬性測試
    - **Property 24: 簽名驗證後才接受 AgentCard**
    - 驗證 AgentCard 註冊/更新事件必須先通過簽名驗證才入庫
    - **驗證：需求 5.2, 11.3**

  - [x] 7.12 撰寫 msg.relay catchup 語義屬性測試（MVP 必做）
    - **Property 25: msg.relay catchup 語義**
    - 驗證零落地模式 catchup 不含 msg.relay；TTL 模式僅補發未過期密文
    - **驗證：需求 8.5, 2.5, 2.6**

  - [x] 7.13 撰寫盲轉送屬性測試（MVP 必做）
    - **Property 17: 盲轉送——Hub 無明文**
    - 驗證 msg.relay 經 Hub 後，DB 與日誌中不存在可還原為明文的資料
    - **驗證：需求 8.3, 8.5, 10.4, 22.2**
  - **實作備註**：Task 7 全部 13 sub-tasks 完成。WS 層架構：`packages/hub/src/server/ws/` 下 7 個模組（types, connection-manager, auth-handler, data-policy, event-handler, catchup-service, msg-relay-handler）+ ws-plugin 編排器 + rate-limiter。Integration tests 使用 `app.listen({port:0})` + `ws` client + `createFrameCollector()` 解決 @fastify/websocket 時序問題。Per-operation rate limits: `SlidingWindowLimiter`（AgentCard ≤10/min, pairing ≤30/hr）。PBTs: P3（冪等）、P5（單調）、P11（最小化）、P17（盲轉送）、P24（簽名先驗）、P25（catchup 語義）全部通過。Health endpoint 已更新為使用 `app.connections.size`。
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 208/208 ✅ format:check ✅

- [x] 8. 實作 Hub 配對狀態機（`packages/hub`）
  - [x] 8.1 實作配對狀態機邏輯
    - 狀態轉換：none → pending → active → revoked，pending → revoked
    - 拒絕非法轉換並回傳描述性錯誤（pair_invalid_transition）
    - 拒絕重複配對請求（pair_duplicate）
    - 撤銷後立即停止 msg.relay 轉送
    - _需求：7.2, 7.3, 7.4, 7.5, 7.6_
    - **實作備註**：`validatePairingOp` 在 event-handler.ts step 3b（idempotency 之後、DB insert 之前）攔截非法配對操作。新增 error codes: `pair_sender_not_found`, `pair_duplicate`, `pair_not_found`, `pair_invalid_transition`。P14 PBT 發現 revoked 後可重新 pair.requested（因 `hasPendingOrActive` 只擋 pending/active），這是正確行為。驗證日期：2026-03-02，215/215 tests。

  - [x] 8.2 撰寫配對狀態機合法性屬性測試（MVP 必做）
    - **Property 14: 配對狀態機合法性**
    - 使用 fast-check 隨機產生配對事件序列，驗證僅允許合法轉換
    - **驗證：需求 7.2, 7.3, 7.5, 7.6**

  - [x] 8.3 撰寫撤銷後停止訊息轉送屬性測試（MVP 必做）
    - **Property 15: 撤銷後停止訊息轉送**
    - 驗證 revoked 配對的 msg.relay 被拒絕
    - **驗證：需求 7.4, 8.4**

- [x] 9. Checkpoint — 確認 Hub WebSocket 與配對狀態機正確
  - 確保所有測試通過，若有疑問請詢問使用者。
  - **驗證日期：2026-03-02，215/215 tests，typecheck + lint + format:check 全綠**

- [x] 10. 實作 Plugin 核心模組（`packages/plugin`）
  - [x] 10.1 實作 Plugin Manifest 與 configSchema
    - 建立 `openclaw.plugin.json`（id: "agentverse", channels: ["agentverse"]）
    - 定義 configSchema（hubUrl 必填、identityKeyPath、publicFields）
    - 敏感欄位標記 sensitive
    - 實作 uiHints
    - _需求：1.1, 1.2, 1.3, 1.4_
    - **實作備註**：Zod schema（`PluginConfigSchema`）+ `parseConfig()` 驗證函式；5 unit tests

  - [x] 10.2 實作 WebSocketConnectionManager
    - 建立 WebSocket 出站連線至 Hub
    - 實作 challenge-response 認證握手
    - 實作指數退避重連策略（初始 1s、最大 60s、backoff ×2、jitter）
    - 重連時以 last_seen_server_seq 請求 catchup
    - 連線狀態回報（connected / disconnected / reconnecting）
    - _需求：2.1, 2.2, 2.3, 2.4, 2.5_
    - **實作備註**：EventEmitter-based class（states: disconnected→connecting→authenticating→connected→reconnecting）；`handleChallenge` signs nonce bytes via IdentityManager；auth_error prevents reconnect；`close()` emits "disconnected" before removeAllListeners；19 unit tests（mock WebSocket）

  - [x] 10.3 撰寫指數退避重連屬性測試
    - **Property 7: 指數退避重連**
    - 使用 fast-check 隨機產生連續斷線次數，驗證延遲計算為 `min(1000 * 2^(N-1), 60000)` + jitter
    - **驗證：需求 2.3**
    - **實作備註**：3 property tests（exact values, monotonic cap, jitter non-negative）

  - [x] 10.4 實作 EventDeduplicationCache（Plugin 端）
    - 本地 seen_event_id 快取（時間窗 + LRU）
    - 丟棄已處理過的重複事件
    - _需求：4.5_
    - **實作備註**：Map-based cache with TTL eviction + LRU at maxSize；6 unit tests

  - [x] 10.5 撰寫事件冪等性（Plugin 端）屬性測試
    - **Property 4: 事件冪等性（Plugin 端）**
    - 使用 fast-check 隨機產生事件，重複投遞，驗證重複事件被丟棄
    - **驗證：需求 4.5**
    - **實作備註**：2 property tests（first true/second false, unique set)

  - [x] 10.6 實作 ServerSeqCursorManager
    - 本地持久化 last_seen_server_seq
    - **cursor 僅在發送 consumer_ack 後才推進**
    - submit_result 不影響 cursor
    - _需求：2.7_
    - **實作備註**：BigInt cursor, disk persistence, monotonic ack only；5 unit tests

  - [x] 10.7 撰寫 Cursor 僅由 consumer_ack 驅動推進屬性測試（MVP 必做）
    - **Property 8: Cursor 僅由 consumer_ack 驅動推進**
    - 模擬事件接收與投遞成功/失敗場景，驗證 cursor 行為
    - **驗證：需求 2.7**
    - **實作備註**：Random interleaved ack/submitResult ops × 100 runs

  - [x] 10.8 實作 EventToChannelMapper 與 Social Agent 路由
    - 將 MVP 事件類型（pair.requested、pair.approved、pair.revoked、msg.relay）映射為 OpenClaw channel inbound message 格式
    - 所有 inbound 訊息路由至 agentId=social
    - 拒絕路由至非 social 的 agentId
    - 未知事件類型記錄警告日誌並丟棄，不中斷運作
    - 以 server_seq 為準確保投遞順序性
    - _需求：21.1, 21.2, 21.3, 21.4, 9.1, 9.4_
    - **實作備註**：MVP_ROUTABLE_TYPES set；agent.registered/updated → null (no warn); unknown → null + warn；9 unit tests

  - [x] 10.9 撰寫 Social Agent 路由不變式屬性測試
    - **Property 18: Social Agent 路由不變式**
    - 驗證所有 inbound 訊息路由至 agentId=social 且僅路由至該 agent
    - **驗證：需求 9.1, 9.4**

  - [x] 10.10 撰寫事件類型映射完整性屬性測試
    - **Property 19: 事件類型映射完整性**
    - 驗證所有 MVP 事件類型正確映射為 channel inbound message 格式
    - **驗證：需求 21.1, 21.2**

  - [x] 10.11 撰寫未知事件類型優雅處理屬性測試
    - **Property 20: 未知事件類型優雅處理**
    - 使用 fast-check 隨機產生未知 event_type，驗證記錄警告並丟棄，不拋出例外
    - **驗證：需求 21.3**
    - **實作備註**：P18+P19+P20 合併為 `event-mapper.pbt.test.ts`，3 property tests

  - [x] 10.12 實作 Social Agent 配置檢查與 print-only preset
    - 啟動時檢查 OpenClaw 配置中是否存在 agentId=social
    - 若不存在：CLI 輸出建議配置片段（print-only）
    - 若存在但 tools.deny 不足：輸出警告，列出缺少的 deny 項目
    - 實作 `printSuggestedConfig()` 函式
    - _需求：9.2, 9.3_
    - **實作備註**：REQUIRED_DENY = [file_write, shell_exec, network_outbound]；7 unit tests
  - **實作備註**：Task 10 全部 12 sub-tasks 完成。Plugin 核心模組架構：`packages/plugin/src/` 下 8 個模組（identity, config, backoff, dedup-cache, cursor-manager, ws-connection-manager, event-mapper, social-agent-check）+ manifest JSON + barrel index.ts。新增依賴：ws, @types/ws, zod, fast-check。PBTs: P4（冪等）、P7（退避）、P8（cursor）、P18/P19/P20（routing）全部通過。
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 282/282 ✅ format:check ✅

- [x] 11. Checkpoint — 確認 Plugin 核心模組正確
  - 確保所有測試通過，若有疑問請詢問使用者。
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 282/282 ✅ format:check ✅

- [x] 12. 實作 E2E 加密模組（`packages/shared` 或 `packages/plugin`）
  - [x] 12.1 實作 E2E v1 加密/解密（X25519 + HKDF-SHA-256 + XChaCha20-Poly1305）
    - 使用 `libsodium-wrappers`
    - 加密流程：生成臨時 X25519 keypair → ECDH → HKDF-SHA-256（salt=ek_pub‖B_pub, info="agentverse-e2e-v1"）→ XChaCha20-Poly1305 加密（AAD = event_id ‖ pair_id ‖ sender_pubkey）
    - 解密流程：ECDH → HKDF → XChaCha20-Poly1305 解密（重建 AAD）
    - nonce 內嵌於 ciphertext 前 24 bytes
    - 臨時 keypair 用完即棄，不持久化
    - _需求：8.1, 8.2, 8.6_
    - **實作備註**：模組位於 `packages/shared/src/e2e.ts`，exports: initSodium, getSodium, generateX25519Keypair, ed25519KeyToX25519, encryptMessage, decryptMessage + 3 types。libsodium-wrappers v0.7.16 ESM packaging bug → 使用 `createRequire` 載入 CJS build。HKDF-SHA-256 使用 `@noble/hashes/hkdf`（libsodium 0.7.16 未暴露 HKDF 函式）。17 unit tests 覆蓋 round-trip、empty、unicode、wrong key、tampered AAD×3、tampered ciphertext、ephemeral uniqueness、ciphertext format。

  - [x] 12.2 撰寫 E2E 加密 Round-Trip 屬性測試（MVP 必做）
    - **Property 16: E2E 加密 Round-Trip（X25519 + HKDF + XChaCha20-Poly1305）**
    - 使用 fast-check 隨機產生訊息內容與 X25519 keypair，驗證加密→解密 round-trip
    - 驗證篡改 AAD 中任一欄位時解密失敗（AEAD 認證標籤不匹配）
    - **驗證：需求 8.2, 8.6**
    - **實作備註**：5 property tests（round-trip ×100、tampered event_id ×50、tampered pair_id ×50、tampered sender_pubkey ×50、wrong recipient key ×50）
  - **實作備註**：Task 12 全部 2 sub-tasks 完成。新增依賴：libsodium-wrappers, @types/libsodium-wrappers。HKDF 使用 @noble/hashes/hkdf（已有依賴）。Barrel exports 更新（index.ts +9 exports）。Spec compliance review PASS。
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 304/304 ✅ format:check ✅（P14/P15 全套並行時偶爾 timeout，單獨跑通過）

- [x] 13. Checkpoint — 確認 E2E 加密正確
  - 確保所有測試通過，若有疑問請詢問使用者。
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 304/304 ✅ format:check ✅

- [x] 14. 實作 Hub Web UI（`packages/web`） ✅ verified
  - **Antigravity 前置交付（2026-03-02，全部就緒 ✅）**：
    - CSS Custom Properties：`packages/web/src/styles/tokens.css`（所有 256-Color design tokens → :root 變數，14.1 直接 @import）
    - Wireframe 規格：`ref_doc/uiux_design_ref/wireframe_specs.md`（AgentCard 320x180 像素佈局 / AgentDex Tiling Grid / Pairing Dialog / Chat 終端機風格 / Responsive 3 斷點 / Loading ASCII spinner / Error 格式）
    - 靜態資產：10 PNG in `packages/hub/public/assets/mvp-default/`（manifest.json 已完整）
    - 設計系統 SSOT：`ref_doc/uiux_design_ref/design_tokens.md` + `phase3_ui_guide.md`
  - [x] 14.1 建立 React/Next.js 專案骨架（`packages/web`） ✅ verified
    - 設定 Design Token 系統（與 OpenClaw 風格一致）
    - 設定路由結構（AgentDex、配對管理、設定）
    - **Web UI 為獨立 package（`packages/web`），與 `packages/hub`（純 server）分離；Docker Compose 以兩個服務跑**
    - _需求：6.4_

  - [x] 14.2 實作 AgentDex 圖鑑頁面 ✅ verified
    - 卡片式佈局呈現公開 AgentCard（display_name、persona_tags、能力摘要、等級、徽章）
    - 搜尋功能（display_name / persona_tags 關鍵字搜尋，500ms 內回傳）
    - 標籤篩選功能（MVP: free-text search covers tag names; tag picker UI deferred）
    - 分頁載入
    - _需求：6.1, 6.2, 6.3_

  - [x] 14.3 實作配對管理 UI ✅ verified
    - 發起配對請求
    - 批准/拒絕配對請求
    - 撤銷配對
    - 配對狀態顯示
    - _需求：7.1, 7.3, 7.4_

  - [x] 14.4 實作 session 認證（Web UI 端） ✅ verified
    - 登入/登出流程
    - JWT token session 管理（POST /api/auth/token + localStorage + AuthProvider）
    - _需求：11.3_
  - **驗證日期**：2026-03-02；typecheck ✅ lint ✅ test 315/315 ✅ format:check ✅

- [x] 15. 實作 Asset Pack 系統與資產生成工具 ✅
  - [x] 15.1 實作 Asset Pack manifest 載入與靜態資產服務 ✅ verified
    - 定義 manifest.json schema（id、version、name、assets 分類）
    - Hub 靜態資產路由 `GET /api/assets/:pack/*`
    - Web UI 從 manifest 載入資產引用
    - _需求：26.1, 26.2, 26.3_
    - **實作備註（Task 5 預先完成 Hub 路由部分）**：`packages/hub/public/assets/mvp-default/manifest.json`（avatars 3 + badges 5 + card_frames 1 + backgrounds 1）；`GET /api/assets/:pack/*` 靜態路由已在 Task 5.3 完成；Web UI manifest 載入部分於 Task 14 實作時對齊。
    - **Antigravity 交接（2026-03-02）**：10 張最終點陣 PNG 全部到位（pngquant 壓縮 + alpha channel 清理完成）。設計系統 SSOT：`ref_doc/uiux_design_ref/design_tokens.md`（256-Color 8-bit BBS & GBA Hybrid，CSS 鐵則：border-radius:0 / hard shadows / ANSI Blue 背景）。Phase 3 UI 指南：`ref_doc/uiux_design_ref/phase3_ui_guide.md`（Trials Runner + LineageGraph 用 Canvas/SVG 手繪，不用靜態圖檔）。

  - [x] 15.2 建立 `tools/asset-gen` CLI 腳本 ✅ verified
    - **SSOT**：讀取 `tools/asset-gen/items/mvp-default.yaml`（唯一 items 定義來源）
    - 生成 placeholder PNG（幾何彩色方塊，鎖定 UI 尺寸用）
    - 輸出至 `public/assets/mvp-default/{category}/`
    - 自動生成/更新 `public/assets/mvp-default/manifest.json`
    - 此腳本僅供開發期使用，不進入運行時路徑
    - _需求：26.4, 26.5_
    - **實作備註（2026-03-02）**：5 modules in `tools/asset-gen/src/` — types, yaml-parser, manifest-generator, placeholder-gen, cli。33 tests (9+6+9+6+3)。TDD w/ Vitest。Tech: yaml + pngjs + minimist。mergeManifest preserves extras from existing manifest. YAML SSOT has 10 items (3 avatars + 5 badges + 1 frame + 1 bg).
    - **nanobanana 移除（2026-03-02）**：原 `--mode final` 透過 nanobanana MCP 生成最終資產的功能已移除。最終美術資產由 Antigravity Agent 手工生成並交付，不需要 AI 圖片生成 pipeline。刪除 nanobanana-client.ts + test + 操作手冊。

  - [x] 15.3 Phase 0：生成 placeholder pack ✅ verified
    - 執行 `node tools/asset-gen/dist/cli.js`
    - 10 張 placeholder PNG 已生成（3 avatars 64x64 + 5 badges 32x32 + 1 frame 320x180 + 1 bg 128x128）
    - manifest.json 已自動更新
    - _需求：26.3_

  - [N/A] ~~15.4 Phase 1：生成最終風格資產並 commit~~
    - **已取消**：最終美術資產由 Antigravity Agent 手工生成（Session 28-31），不需要 nanobanana AI 生成 pipeline。10 張最終 PNG 已到位。

- [ ] 16. 實作自託管部署配置
  - [ ] 16.1 建立 Docker Compose 配置
    - **兩個服務**：hub（Fastify + WS + DB client）、web（Next.js 前端）+ PostgreSQL
    - 環境變數配置模板（.env.example）
    - _需求：23.1, 23.4_

  - [ ] 16.2 建立整合測試用 mount 腳本
    - 將 plugin 掛載至 openclaw-main/extensions/agentverse 的腳本（符號連結或複製 build output）
    - **不得在 `openclaw-main/` 內直接寫源碼；腳本僅映射 `packages/plugin` 的 build output**
    - **mount 前保護**：腳本先執行 `git -C openclaw-main status --porcelain`，若有未提交變更則中止並輸出「openclaw-main 為只讀參考，偵測到工作樹變更，請先還原」
    - _需求：（monorepo 架構決策）_

  - [ ] 16.3 建立 configSchema 對齊 OpenClaw 的 smoke test
    - 使用 `openclaw-main` 的 gateway/doctor config validation entrypoint（或等價 CLI）跑一次驗證
    - 測試案例：給一個有效 agentverse config → 應 pass；給一個 unknown key / 錯型別 → 應 fail
    - **目的：確保 Plugin 的 configSchema 真正被 OpenClaw 按同樣語義執行，避免自證循環**
    - _需求：1.3_

- [ ] 17. Checkpoint — 確認 UI、Asset Pack、部署配置正確
  - 確保所有測試通過，若有疑問請詢問使用者。

- [ ] 18. 端到端整合測試（`packages/e2e` 或頂層 `tests/e2e`）
  - [ ] 18.1 實作端到端測試基礎設施
    - 設定測試用 Hub 實例（in-process 或 Docker）
    - 設定兩個模擬 OpenClaw runtime（Plugin A + Plugin B）
    - _需求：22.1_

  - [ ] 18.2 實作配對流程端到端測試
    - 兩個 runtime 連線至同一 Hub → 完成配對流程（pair.requested → pair.approved）
    - 驗證配對狀態正確轉換
    - _需求：22.1_

  - [ ] 18.3 實作 E2E 訊息交換端到端測試
    - 配對後交換加密訊息 → 驗證 Social Agent 正確接收解密後訊息
    - 驗證 Hub DB 中不包含訊息明文
    - _需求：22.1, 22.2_

  - [ ] 18.4 實作斷線重連端到端測試
    - Hub 重啟 → Plugin 自動重連 → 以 last_seen_server_seq 補發事件
    - Plugin 重啟 → 恢復配對狀態
    - _需求：22.3_

  - [ ] 18.5 實作安全場景端到端測試
    - 重放事件不產生重複狀態
    - 篡改 payload 的事件被拒絕
    - 未配對 Agent 之間的 msg.relay 被拒絕
    - 撤銷後 msg.relay 被拒絕
    - _需求：22.4_

- [ ] 19. 最終 Checkpoint — 確認所有 MVP 測試通過
  - 確保所有單元測試、屬性測試、端到端測試通過。
  - 確認需求覆蓋：所有 Phase 0+1 需求（1-12, 21-23, 25-26）皆有對應任務。
  - 若有疑問請詢問使用者。

---

## Phase 2/3 Backlog（不在 MVP 範圍內）

以下任務為後續迭代 backlog，MVP 階段不實作：

- [ ] B1. Trials Runner 本地執行與分數上報（Phase 2）
  - _需求：15_

- [ ] B2. Hub Web UI 成長頁面（XP/等級/技能樹/徽章）（Phase 2）
  - _需求：17_

- [ ] B3. GenePack 交換流程（Phase 3）
  - _需求：13, 14_

- [ ] B4. Lineage 家族樹事件記錄與 UI 視覺化（Phase 3）
  - _需求：16, 18_

- [ ] B5. Fusion Lab 合成介面（Phase 3）
  - _需求：24_

- [ ] B6. 進階反濫用與信任層級（Post-MVP）
  - _需求：19_

- [ ] B7. 資料匯出與刪除（Post-MVP）
  - _需求：20_

---

## 備註

- 標記 `*` 的子任務為可延後的屬性測試，趕工時可暫緩但不建議長期跳過
- **無 `*` 標記的屬性測試為 MVP 必做**（P1/P2/P8/P14/P15/P16/P17/P25），不可跳過
- 每個任務引用具體需求編號以確保可追溯性
- 屬性測試驗證設計文件中的 25 個正確性屬性
- Checkpoint 任務確保遞增驗證
- 使用者提出的要點已分別嵌入：
  1. **openclaw-main 只讀 + repo 分離**：見硬約束段落 + 任務 16.2
  2. **TTL 模式 server_seq 一致性**：見硬約束段落 + 任務 4.1 + 7.6（events 佔位記錄 + offline_messages 連結）
  3. **屬性測試分級**：見硬約束段落（8 個必做 + 其餘可延後）
  4. **configSchema 對齊 OpenClaw smoke test**：見任務 16.3
  5. **Web UI 獨立 package**：見硬約束段落 + 任務 14（`packages/web`）
  6. **catchup-eligible 事件集**：見任務 7.4（明確列出 MVP catchup 範圍）
  7. **submit_event frame 不攜帶 server_seq**：見任務 1.2 與 7.2（區分 submit_event vs event frame type）
  8. **data_policy_violation 使用 schema/whitelist 結構性檢查**：見任務 7.5（明確禁止全文正則）
  9. **openclaw-main pre-commit/CI gate + mount script 保護**：見硬約束段落第 5/6 條 + 任務 16.2
  10. ~~**nanobanana 開發期操作手冊**~~：已移除（最終資產由 Antigravity Agent 手工交付，不需要 AI 圖片生成）
