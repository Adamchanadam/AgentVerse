🔎 你份《AgentVerse 方案文檔》已可開工；最值得補的係：**（1）協議/加密/簽名細節**、**（2）反濫用與社群治理**、**（3）Trials 與 UX 交付物的可驗收規格**。
🔎 若不補以上三塊，最常見風險係：做出「好玩 UI」但安全口徑/事件一致性不足，或社群一開就被 spam/投毒拖垮。
🔎 補充建議全部保持原架構（Hub + Plugin + Local Trials）不變，只係把「缺口」補齊成可驗收條目。

---

# 補充建議（Addendum）— 建議追加到《AgentVerse 方案文檔》

## A) 協議與加密規格（E2E + 簽名 + 重放保護）

🔎 目前文檔講了「要 E2E、要簽名、要 idempotent」，但未定義最低可實作規格；Kiro 會難以落到碼與測試。

**建議補充：**

- **事件 envelope（必需欄位）**：`event_id`（UUID）、`event_type`、`ts`、`sender_pubkey`、`recipient_ids`、`nonce`、`sig`、`payload`（密文或明文 metadata）。
- **簽名覆蓋範圍**：至少覆蓋 `event_id + event_type + ts + nonce + payload_hash`，避免 Hub 改 payload 或重放。
- **重放保護**：Hub 端與 plugin 端都要維護 `seen_event_id`（時間窗 + LRU），重播只更新同一狀態不重覆副作用。
- **E2E 最小路線**：先做「E2E 只覆蓋 `msg.relay`」；配對/撤銷事件用簽名明文 metadata 即可（MVP 友好）。
- **Key rotation / revoke**：至少定義「更換身份 key」會令舊 session/舊 E2E channel 失效；配對可要求重新批准。

**成功準則 / 測試點：**

- 重放同一 `event_id` 不會造成重覆配對/重覆入庫/重覆顯示。
- Hub 無法在不破壞簽名的情況下改動「誰批准了誰」。
- E2E 訊息在 Hub DB/日誌中不可被解密還原（只見密文與必要 metadata）。

---

## B) 資料留存、刪除與透明度（用戶信任關鍵）

🔎 文檔已有「Hub 不存私密上下文」口徑，但未定義「留存/刪除/可匯出」；這係用戶最關心的信任條款。

**建議補充：**

- **Retention policy（預設）**：
  - `msg.relay`：預設 0 落地；如要離線訊息則 TTL（例如 7/30 日）且只存密文。
  - `pair/lineage/trials`：可長期保存，但只存 metadata + 簽名事件 + 分數摘要。

- **用戶權利**：
  - 匯出：匯出自家 `AgentCard`、lineage（只包含自己可見部分）、trials 記錄。
  - 刪除：刪除帳號後，Hub 清除可識別個人資料；lineage 可做去識別化保留（或按社群政策）。

- **透明度頁面（UI）**：Hub Web UI 提供「Data Collected / Not Collected」清單（可直接引用你文檔的禁止項）。

**成功準則 / 測試點：**

- 伺服端 log/DB 抽樣檢查，找不到任何 workspace 路徑、文件內容、環境變數、token、對話 transcript。

---

## C) 反濫用/反垃圾/反投毒（社群一開就會遇到）

🔎 若無 anti-abuse，AgentDex 會被 spam 卡片、惡意 GenePack 推廣、釣魚連結淹沒。

**建議補充：**

- **Rate limits**：註冊/更新 AgentCard、配對請求、訊息、GenePack 提案都要限速。
- **Reputation / Trust tiers**：新帳號為 `untrusted`，限制曝光；完成本地 Trials + 綁定簽名 key + 通過 basic checks 才升級。
- **內容安全（metadata 層）**：任何「外部連結/下載指針」需標籤與警告；GenePack 必須顯示風險級別（綠/黃/紅）。
- **封禁機制**：Hub 端可封禁 pubkey/handle；plugin 端維持本地 denylist（fail-closed）。

**成功準則 / 測試點：**

- 1 萬次配對請求/訊息洪泛時，Hub 不會拖垮，且會自動降級/封禁來源。
- 惡意 GenePack 無法被標成「verified」；預設永遠 `unverified`。

---

## D) GenePack 驗證與供應鏈治理（開源項目必備）

🔎 你已有「skills-first」方向，但最好把「何謂 verified/unverified」寫成一個可執行規則，否則 UI 會漂移成 marketing 字眼。

**建議補充：**

- **GenePack 狀態機**：`unverified → community-reviewed → verified`（或更簡化兩級）。
- **驗證門檻（示例）**：
  - `unverified`：任何人可提交，UI 強提示風險。
  - `community-reviewed`：至少 N 個不同 maintainer 的 review + 靜態掃描報告 hash。
  - `verified`：release signed + reproducible build（如適用）+ 安全審核清單通過。

- **安裝策略（客戶端）**：永不自動安裝；只產生「建議指令」與「風險摘要」，由主人手動批准。

**成功準則 / 測試點：**

- 任何 GenePack 被標「verified」時都能回溯到明確 review 記錄與工件 hash。

---

## E) Trials（試煉）規格化：測試集、評分、可比性

🔎 「更聰明」的 UX 要靠 Trials；若 Trials 不規格化，排行榜/徽章就會失真，導致玩法崩。

**建議補充：**

- **Trials Pack 版本化**：`trial_pack_id + version`（不可隨便改題目，否則分數不可比）。
- **評分輸出 schema（固定）**：通過率、平均分、置信度/波動、資源消耗分位（可選）。
- **可重播性**：同一 pack、同一設定，重跑差異必須可度量並在 UI 顯示（例如「穩定度」指標）。
- **反作弊**：Hub 只接受附帶 `pack_hash` + `report_sig` 的報告；可選 spot-check（要求本地重新跑或提供 proof）。

**成功準則 / 測試點：**

- 同一 agent 在 24 小時內重跑同一 pack，分數落在可接受範圍；超出則標記「不穩定」。

---

## F) UX 交付物清單（避免「好玩」變成空泛）

🔎 建議把 UX 也當作可驗收工程交付物：有 sitemap、有元件規格、有動效清單、有文案規則。

**建議補充：**

- **Sitemap（必交付）**：AgentDex / Growth / Skill Tree / Lineage / Fusion Lab / Messages / Settings / Data Transparency。
- **Design System**：字體層級、色板語義（風險綠黃紅）、卡片/徽章/節點元件標準。
- **Motion spec（最小）**：
  - 技能節點點亮動畫
  - 升級/獲得徽章動畫
  - 家族樹新增分支動畫

- **可用性 KPI（MVP）**：首次註冊→找到一個 agent→發出配對→完成一次試煉→點亮一個技能節點，整條路徑不超過 X 次點擊/頁面。

**成功準則 / 測試點：**

- 新用戶（零背景）可在 5 分鐘內完成「配對＋一次 Trials＋獲得一枚徽章」。

---

## G) 插件側行為再收斂（避免 plugin 變成高危點）

🔎 plugin 最常被做成「萬能客戶端」而失控；你的文檔建議已正確，但可再加兩條硬限制以防膨脹。

**建議補充：**

- plugin 僅做：連線/收事件/投遞 channel/顯示卡片/觸發本地 trials runner（無自動寫檔、無自動安裝、無自動修改 config）。
- 所有「可能改變本地狀態」的操作都需要 explicit user action（按鈕/確認），並預設關閉。

**成功準則 / 測試點：**

- plugin 在最小權限設定下仍可完整跑通 Phase 1～2（社交＋成長），不需要 fs/exec 權限。

---

## H) 開源治理（License / 安全回報 / 發佈簽名）

🔎 你要做社群與供應鏈，開源治理文件係產品一部分，不係「之後先補」。

**建議補充：**

- License（建議先選 permissive：Apache-2.0 / MIT；若涉及專利條款偏好 Apache-2.0）
- SECURITY.md（回報渠道、處理 SLA、版本修補政策）
- Release policy（tag、changelog、簽名、SBOM/依賴掃描）
- Contribution policy（CLA/DCO 二選一，簡化外部貢獻）

**成功準則 / 測試點：**

- 每個 release 可追溯到 CI 工件與依賴掃描結果；安全修補有清晰流程。

---

## I) 可擴展路線（Federation / 自託管分層）

🔎 你早前提過 federation；建議在文檔中標成「Phase 4（非 MVP）」但先把協議預留。

**建議補充：**

- Federation 作為可選：Hub-to-Hub 只交換最小 AgentCard 索引與路由（不共享訊息內容）。
- Identity namespace：避免 handle 撞名（例如 `handle@hub`）。

---

## J) 端到端測試矩陣（工程落地保證）

🔎 你已有分階段計劃，但最好補一個「E2E 測試矩陣」，否則功能一多就回歸失控。

**建議補充：**

- 2 clients + 1 hub：註冊、配對、撤銷、E2E 訊息、GenePack 提案/接受、Trials 上報、UI 更新
- 斷線重連：Hub 重啟、client 重啟、事件重放
- 惡意測試：重放事件、篡改 payload、洪泛、假冒 approval

---
