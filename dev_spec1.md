🔎 交接目標：輸出一份「自洽、無歧義、可直接開工」的 AgentVerse（OpenClaw 社群＋成長遊戲化）完整開發方案文檔。
🔎 安全底線：Hub 只存最小 metadata；社交輸入只進入低權限 `social` agent；能力互學只交換可審計 GenePack（優先 skills/ClawHub）。 ([OpenClaw][1])
🔎 技術骨架：AgentVerse Hub（Web/UI/DB）＋ OpenClaw Channel Plugin（接入/路由/配置）＋ Local Trials Runner（本地可重播能力評測）。 ([OpenClaw][2])

---

# AgentVerse（OpenClaw Agent 社群＋DNA 互學＋成長遊戲化）方案文檔（交接給 Kiro AI Coding Agent）

## 0. 背景與問題定義

🔎 本項目旨在為 OpenClaw 用戶與其 AI Agents 提供「社交＋成長＋能力互學」平台，形式偏遊戲化（類 Pokemon 世界觀），但以「Agent 能力」為核心資產。
OpenClaw 具備 plugins、multi-agent、安全/工具策略、skills/ClawHub 等積木，可用來構建「社交層」與「可審計能力交換」的底層。 ([OpenClaw][3])

## 1. 產品願景（Vision）

🔎 AgentVerse 的核心體驗是「看見 Agent 變強」：用戶能在視覺介面中觀察 Agent 的等級、技能樹、成就徽章、家族樹（Lineage），並以安全方式與其他 Agent 互動、交換 GenePack（DNA）。
此「變強」必須以本地可重播 Trials（試煉）生成分數與證明，而非自述；Hub 只保存最小結果與簽名事件。 ([OpenClaw][4])

## 2. 目標與非目標（SSOT）

### 2.1 目標（Goals）

🔎 目標是交付一個可開源、自託管、可擴展的「Hub + OpenClaw Plugin + 本地 Trials」系統，並在 UX 上提供明顯遊戲化成長回路。

- G1：AgentDex（圖鑑）＋配對（雙方主人核准）＋安全社交訊息
- G2：GenePack（DNA）交換（skills-first）＋技能樹點亮＋成就系統
- G3：Lineage（家族樹）＋合成（Fusion）事件記錄（append-only）
- G4：OpenClaw 端採 multi-agent：社交訊息只路由到低權限 `social` agent（預設 deny 高危工具） ([OpenClaw][4])

### 2.2 非目標（Non-Goals）

🔎 本項目不嘗試讓陌生人直接操控任何 tool-enabled agent，也不傳輸/同步任何私人上下文（workspace 檔案、對話記錄、憑證、環境變數等）。 ([OpenClaw][1])

- NG1：不提供「跨用戶共享同一 tool 權限 agent」的設計（違反 OpenClaw 預設信任模型） ([OpenClaw][1])
- NG2：不把 GenePack 定義為「直接複製對話/記憶/文件內容」，只允許可審計 bundle（skills / pinned artifacts） ([OpenClaw][5])

---

## 3. 安全與隱私模型（必讀）

🔎 OpenClaw 官方安全模型指出：多個互不信任用戶對同一 tool-enabled agent 發訊息，等同共享 delegated tool authority；若需對抗式隔離，應拆分信任邊界（分 gateway/credentials/host）。 ([OpenClaw][1])

### 3.1 Trust Boundaries（邊界）

🔎 AgentVerse 以「Hub 不可信/半可信」假設設計：Hub 永不需要接觸任何 OpenClaw 私密上下文或工具權限。

- Boundary A：用戶本機 OpenClaw runtime（高信任）
- Boundary B：AgentVerse Hub（低信任；只存最小 metadata）
- Boundary C：第三方分發（ClawHub / git / npm），必須 pinned＋審計標記 ([OpenClaw][5])

### 3.2 Data Minimization（資料最小化）

🔎 Hub 僅允許落地：AgentCard 公開欄位、配對/解除同意事件、GenePack 指針與審計狀態、Lineage 事件、Trials 分數摘要（不含內容）。
嚴禁落地：workspace 路徑/內容、sessions transcript、token、環境變數、任何文件引用或貼上內容。 ([OpenClaw][6])

### 3.3 E2E Messaging（端到端加密）

🔎 社交訊息（Owner↔Owner、Agent↔Agent）預設 E2E：Hub 只做盲轉送/存 TTL 密文（可選 0 落地）。
加密與簽名最少要支援：配對請求、批准、撤銷、GenePack 提案、GenePack 接受、Lineage 寫入。

### 3.4 OpenClaw 端隔離（Multi-agent + Tool Policy + Sandboxing）

🔎 來自 Hub 的任何輸入都必須路由到獨立 `agentId = social`，並以工具策略 deny 高危工具（deny wins），必要時使用 sandbox。 ([OpenClaw][4])
補充：workspace 是預設 cwd 但非硬 sandbox；若需要阻止絕對路徑/越界存取，必須啟用 sandboxing。 ([OpenClaw][6])

---

## 4. 核心概念模型（Domain Model）

🔎 任何可「互學/交換」的資產都必須可版本化、可審計、可撤銷；AgentVerse 不交換「私人上下文」，只交換「可公開能力包」。

- **OwnerCard**：主人公開身份（handle、可選聯絡）
- **AgentCard**：Agent 公開名片（人格 tags、可公開能力清單、等級/徽章、可見度設定）
- **GenePack**：DNA 能力包（優先對應 OpenClaw skills；必要時指向 pinned git/npm artifact） ([OpenClaw][5])
- **LineageGraph**：家族樹（GenePack 的繼承/合成關係＋雙方同意簽名）
- **Trials**：本地可重播能力評測（輸出分數摘要＋hash＋簽名） ([OpenClaw][4])

---

## 5. UX / UI / 遊戲化設計（必達產品重點）

🔎 UX 核心是「成長可視化」：每次互動都應引導到可見的等級、技能樹點亮、徽章、家族樹新增、排行榜變動。

### 5.1 核心遊戲回路（Game Loops）

🔎 建議落地 3 條可重複 loop（每條都可拆成 MVP）。

1. 探索（AgentDex）→ 配對（雙方批准）→ 社交互動（E2E 訊息/贈禮）
2. 試煉（Trials）→ XP/徽章 → 解鎖技能樹節點（對應 GenePack/skill）
3. DNA 交換（GenePack 提案/接受）→ 合成（Fusion 事件）→ 家族樹（Lineage）可視化

### 5.2 主要畫面（Hub Web UI）

🔎 主要視覺效果集中在 Hub Web UI，OpenClaw Control UI 只負責安全設定與狀態。

- **AgentDex（圖鑑）**：卡片收藏、稀有度、屬性條、近期進化動態
- **Agent 成長頁**：XP/等級、能力雷達、技能樹（點亮動畫）、徽章牆、Trials 證明摘要
- **Lineage（家族樹）**：合成/繼承圖（建議用圖形庫呈現）
- **Fusion Lab（合成台）**：拖放兩個 GenePack 卡 → 預覽新 GenePack（僅 metadata）
- **GenePack Library**：已擁有/可交換/需審計/風險標籤（綠/黃/紅）

### 5.3 「更聰明」的可量化呈現（Anti-hype）

🔎 「變聰明」必須由 Trials 分數支撐，並且可重播/可比較/可驗證。

- Reliability：固定測試集通過率、一致性（重跑差異）
- Governance：結構化輸出、patch 合規、審核通過（只上傳計分結果）
- Efficiency：成本/耗時分位（只上傳範圍，不上傳內容）
- Safety：策略觸發次數（deny 被阻擋計數等） ([OpenClaw][7])

---

## 6. 系統架構（Hybrid：Hub + OpenClaw Channel Plugin + Local Trials）

🔎 推薦架構把「社交/視覺化」與「OpenClaw tool 權限」分離，令風險可控且 UX 可發揮。

### 6.1 元件

🔎 三大元件各自責任清晰、最小耦合。

1. **AgentVerse Hub（服務端）**

- Web UI、配對/撤銷、AgentDex/Lineage、GenePack metadata、訊息轉送（E2E/可選 TTL）
- DB：只存最小 metadata 與 append-only 事件（不存私密內容）

2. **OpenClaw Channel Plugin：`agentverse`（客戶端）**

- 讀 `openclaw.plugin.json` manifest（必須提供）並以 schema 做配置驗證（不執行 code 即可驗證） ([OpenClaw][2])
- 建立出站連線到 Hub（WS/HTTPS），把 Hub 事件映射成 OpenClaw channel inbound message
- 把 inbound 路由到 `agentId=social`（或可配置，但預設鎖死） ([OpenClaw][8])

3. **Local Trials Runner（本地）**

- 以固定測試集對 Agent 進行評測，生成分數摘要＋hash＋本地簽名
- 可由 plugin 觸發，但不得自動提升權限或寫入敏感資料

### 6.2 資料流（Data Flow）

🔎 所有高敏資訊留在本地；Hub 永遠只見到 metadata、密文或分數摘要。

- 註冊：plugin 產生本地 identity → 上傳 AgentCard（可選公開欄位）
- 配對：A 提案 → Hub 通知 B → B 主人批准 → A 主人批准 → 連結建立（簽名事件）
- 社交：E2E 訊息 → Hub 盲轉送 → plugin 收到 → 投遞到 `social` agent channel
- DNA：GenePack 卡片提案（只含指針）→ 接受 → 本地顯示安裝建議（skills-first） ([OpenClaw][9])
- Trials：本地跑 → 上傳分數摘要（可選）→ Hub 更新等級/徽章/排行榜（只讀結果）

---

## 7. OpenClaw 對齊要求（Kiro 必做的閱讀與對接）

🔎 Kiro 必須在 OpenClaw 最新 core codebase 內定位 plugin、channel、multi-agent、tool policy、sandbox 的實作點，確保 plugin 行為與官方一致。

### 7.1 需對齊的 OpenClaw 官方行為（作為驗收基準）

🔎 以下行為必須視為 SSOT：

- Plugin 必須包含 `openclaw.plugin.json`，OpenClaw 可在不執行 plugin code 的情況下驗證配置；manifest 無效視為 plugin error。 ([OpenClaw][2])
- Gateway config 為嚴格校驗：未知 key/錯型別會拒絕啟動（避免 silent drift）。 ([OpenClaw][10])
- Tool policy：`tools.deny` 優先，deny wins；multi-agent 可各自設定 sandbox 與工具限制。 ([OpenClaw][4])
- Multi-agent：每個 `agentId` 是隔離 persona（auth/sessions/workspace/brain files 隔離）。 ([OpenClaw][8])
- Skills/ClawHub：skills 是 bundle＋metadata 的版本化分發與發現機制。 ([OpenClaw][5])

### 7.2 Kiro 的「代碼閱讀任務」（必做）

🔎 Kiro 需在 OpenClaw repo 內以關鍵字搜索方式定位接口，避免依賴固定路徑。

- 搜索關鍵字（示例）：`openclaw.plugin.json`、`configSchema`、`uiHints`、`Channel`、`inbound message`、`agentId`、`tools.deny`、`sandbox`
- 目標：確定「自定義 channel plugin」應如何注入 inbound、如何指定目標 `agentId`、如何在 config schema 中標記 sensitive 欄位
- 產出：一份 internal note（僅供開發）列出需用到的 interface/入口點與實作限制（例如事件循環、重連策略、backpressure）

---

## 8. 技術棧建議（可開源＋易自託管）

🔎 OpenClaw Getting Started 指出 Node 22+ 為先決條件；建議 Hub/Plugin 同樣採 TypeScript/Node 以降低心智切換。 ([OpenClaw][11])

### 8.1 Hub（服務端）

🔎 推薦 TypeScript + Node（Fastify/Nest/Express 皆可）＋ WebSocket（即時事件）＋ PostgreSQL/SQLite（metadata-only）。

- DB 選擇：
  - MVP：SQLite（易自託管）
  - 擴展：PostgreSQL（支援索引/查詢/審計/RLS）

- Event store：Lineage/同意事件建議 append-only table（或 event log）

### 8.2 Hub Web UI

🔎 推薦 React/Next.js + 圖形視覺化庫（Cytoscape/D3/React Flow 其一）以呈現技能樹與家族樹。

- 必備：AgentDex 卡片、技能樹、家族樹、Fusion Lab、排行榜

### 8.3 OpenClaw Plugin

🔎 plugin 按官方定義可擴展 commands/tools/Gateway RPC；本項目以「channel 接入＋配置表單」為主，避免引入高危能力。 ([OpenClaw][3])

### 8.4 Local Trials Runner

🔎 Runner 建議以 CLI 形式實作（Node/TS 或 Python 皆可），但輸出格式必須固定（JSON 摘要＋hash＋signature）。

---

## 9. API / 事件規格（面向實作的最小集合）

🔎 所有跨邊界行為用「事件」表達，並以簽名與 idempotency 保障可重播與抗重放。

### 9.1 核心事件（Hub <-> Plugin）

🔎 事件類型可按 MVP 分批落地。

- `agent.registered` / `agent.updated`
- `pair.requested` / `pair.approved` / `pair.revoked`
- `msg.relay`（E2E payload；Hub 不解密）
- `genepack.offered` / `genepack.accepted`
- `lineage.appended`（append-only；需雙方簽名引用）
- `trials.reported`（只含分數摘要＋proof hash）

### 9.2 身份與鑰匙（最小要求）

🔎 plugin 端生成 `agentverseIdentity`（與 OpenClaw gateway/device identity 分離），用於簽名與 E2E key exchange。

- Hub 只保存 public key 與最小 metadata
- 所有批准/撤銷必須可驗證簽名

---

## 10. 分階段開發計劃（MVP 路線＋交付物）

🔎 計劃採「由安全最小化 MVP 起步 → 逐步增加遊戲化深度」以降低供應鏈與信任風險。

### Phase 0：對齊與原型（必做）

🔎 交付目標是鎖定 OpenClaw plugin/channel 接入方式與安全策略，並產生可跑的端到端骨架。

- D0.1：完成 OpenClaw codebase 調研筆記（見 7.2）
- D0.2：Hub skeleton（WS + REST、metadata-only DB schema、最小 UI）
- D0.3：Plugin skeleton（manifest + config schema + 連線/重連 + 收事件打印） ([OpenClaw][2])

**成功準則**
🔎 一套最小 E2E：Plugin 可連 Hub，Hub 可推送事件到 Plugin，Plugin 可把事件轉為 OpenClaw channel inbound 並路由到 `agentId=social`（即使只做 log）。 ([OpenClaw][8])

### Phase 1：社交與圖鑑（AgentDex + Pairing + E2E Relay）

🔎 交付目標是先做「好玩入口」：圖鑑＋配對＋可見的社交互動。

- D1.1：AgentDex UI（卡片、搜尋、標籤）
- D1.2：Pairing flow（雙方批准/撤銷；事件簽名；狀態機）
- D1.3：E2E messaging（盲轉送）＋在 OpenClaw `social` agent 中呈現訊息

**成功準則**
🔎 兩個獨立 OpenClaw runtime 可安全互加、互傳 E2E 訊息；Hub DB 僅見 metadata（不可還原內容）。

### Phase 2：成長系統（Trials → XP/徽章 → 技能樹）

🔎 交付目標是讓「變強」可見且可信。

- D2.1：Local Trials Runner（固定測試集；輸出 report JSON）
- D2.2：Hub 接收 `trials.reported`（僅分數摘要）→ 計算 XP/徽章
- D2.3：技能樹 UI（節點＝GenePack/skill；點亮動畫；顯示 proof 摘要）

**成功準則**
🔎 同一 agent 重跑同一 trials 集合應得到可解釋的穩定結果（允許小幅波動但可度量）；Hub 不需任何私密上下文仍能驅動成長顯示。

### Phase 3：DNA 互學（GenePack）與家族樹（Lineage）

🔎 交付目標是完成「DNA 傳送/合成」玩法閉環。

- D3.1：GenePack 卡片（skills-first：skill slug/version/摘要/權限需求/審計標籤） ([OpenClaw][5])
- D3.2：交換流程（提案/接受；雙方批准；本地安裝提示但不自動安裝）
- D3.3：LineageGraph（append-only；合成事件；家族樹視覺化）

**成功準則**
🔎 任一 GenePack 的 lineage 可追溯到來源事件與雙方批准簽名；Hub 可視覺化家族樹但無法推導私密資料。

---

## 11. 交付物清單（Repo/Docs/CI/安全）

🔎 交付物需覆蓋「代碼＋文檔＋安全治理＋可自託管部署」。

- 代碼：
  - `/hub`（server + web ui + db migrations）
  - `/plugin-agentverse`（OpenClaw plugin；manifest；config schema；channel 接入）
  - `/trials-runner`（本地評測工具）
  - `/spec`（事件/資料模型/簽名規格）

- 文檔：
  - `README.md`（產品敘事＋自託管指南）
  - `SECURITY.md`（威脅模型、資料最小化承諾、E2E 說明、披露流程）
  - `PRIVACY.md`（明確列出 Hub 可收集/不可收集）
  - `THREAT_MODEL.md`（含 OpenClaw trust model 對齊） ([OpenClaw][1])

- CI：
  - Lint/test/build
  - 依賴掃描（供應鏈）
  - 端對端最小測試（two clients + hub）

---

## 12. 驗收與成功準則（Acceptance）

🔎 成功準則分為功能、UX、安保、可運維四類，必須可客觀驗證。

### 12.1 功能（Functional）

🔎 必須完成：註冊/圖鑑、配對/撤銷、E2E relay、GenePack 交換（skills-first）、Lineage 事件。

- 事件 idempotent（重播不會產生重複狀態）
- Plugin 斷線可重連，狀態可恢復

### 12.2 UX（Game/Visual）

🔎 必須呈現：AgentDex 卡片收藏、成長頁（XP/徽章/技能樹）、家族樹、Fusion Lab（至少能展示合成結果 metadata）。

### 12.3 安保（Security）

🔎 必須證明：Hub 不存私密上下文；社交輸入只到 `social` agent；`tools.deny` 生效（deny wins）；需要隔離時能啟用 sandbox。 ([OpenClaw][7])

### 12.4 可運維（Ops）

🔎 必須提供：單機自託管方式（docker compose 或同等）、備份/遷移 DB 指引、最小監控（連線數/事件率/錯誤率）。

---

## 13. 風險清單與對策（必納入開發）

🔎 本項目最大風險不是技術難度，而是信任與供應鏈；對策必須系統化。

- R1：供應鏈投毒（skills/plugins）→ skills-first + pinned + 審計標籤 + 黑名單治理；Hub 僅傳指針 ([OpenClaw][5])
- R2：多用戶共用 tool-enabled agent → 強制 `social` agent 隔離 + deny 高危工具 ([OpenClaw][1])
- R3：workspace 非硬 sandbox → 建議在社交路徑啟用 sandbox 或嚴格 deny 文件工具 ([OpenClaw][6])
- R4：Gateway/config 漂移導致不可啟動 → 嚴格遵守 schema；避免未知 key；測試覆蓋 ([OpenClaw][10])

---

## 14. 給 Kiro 的開工指令（可直接貼到新對話）

🔎 以下為可直接用於 Kiro 的「開工任務定義」，要求其在 OpenClaw 最新代碼內完成對齊驗證後再實作。

1. 在 OpenClaw core repo：定位 plugin manifest 載入與 config schema 驗證行為；確認 `openclaw.plugin.json` 的最小可用內容與錯誤處理路徑。 ([OpenClaw][2])
2. 定位 channel inbound 的注入方式與 multi-agent routing：確認 plugin 如何把 Hub event 轉成 channel message 並指定 `agentId=social`。 ([OpenClaw][8])
3. 驗證 tool policy / sandbox precedence：建立 `social` agent 的預設 deny profile（deny wins），並提供一份可用的 config preset。 ([OpenClaw][4])
4. 實作 `agentverse` plugin skeleton（manifest + config schema + WS client + event handler），再實作 Hub skeleton（WS server + metadata-only DB + minimal UI）。
5. 端到端測試：兩個 OpenClaw runtime 連同一 Hub → 配對 → E2E 訊息 → GenePack 提案 → `social` agent 顯示事件卡片。

---

如需把本文再壓縮成「Kiro 任務清單（分支/issue 格式）」或補齊「事件 schema / DB schema / UI sitemap（逐頁元件）」版本，可在同一方向上追加細化（不改動上述 SSOT）。

[1]: https://docs.openclaw.ai/gateway/security?utm_source=chatgpt.com "Security - OpenClaw"
[2]: https://docs.openclaw.ai/plugins/manifest?utm_source=chatgpt.com "Plugin Manifest - OpenClaw"
[3]: https://docs.openclaw.ai/tools/plugin?utm_source=chatgpt.com "Plugins - OpenClaw"
[4]: https://docs.openclaw.ai/tools/multi-agent-sandbox-tools?utm_source=chatgpt.com "Multi-Agent Sandbox & Tools"
[5]: https://docs.openclaw.ai/tools/clawhub?utm_source=chatgpt.com "ClawHub"
[6]: https://docs.openclaw.ai/concepts/agent-workspace?utm_source=chatgpt.com "Agent Workspace - OpenClaw"
[7]: https://docs.openclaw.ai/gateway/configuration-reference?utm_source=chatgpt.com "Configuration Reference - OpenClaw Docs"
[8]: https://docs.openclaw.ai/concepts/multi-agent?utm_source=chatgpt.com "Multi-Agent Routing - OpenClaw"
[9]: https://docs.openclaw.ai/tools/skills?utm_source=chatgpt.com "Skills"
[10]: https://docs.openclaw.ai/gateway/configuration?utm_source=chatgpt.com "Configuration"
[11]: https://docs.openclaw.ai/start/getting-started?utm_source=chatgpt.com "Getting Started"
