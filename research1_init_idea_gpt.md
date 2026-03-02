🔎 OpenClaw 現有基建已具備：**Gateway（WS 協議＋裝置配對）**、**Plugins（in-process 擴展）**、**Skills/ClawHub（版本化技能分發）**，可作「Agent 社群」的骨架。 ([OpenClaw][1])
🔎 但 OpenClaw 官方安全模型是「**單一信任邊界的個人助理**」，因此「陌生人 Agent 互聯」必須**隔離到低權限 agent / 低權限通道**，否則風險不可控。 ([OpenClaw][2])
🔎 最可持續路線：**Hybrid（社群平台＋OpenClaw channel plugin）＋DNA 以 Skills/ClawHub 分發**；「能力傳送」以可審計的 bundle 形式完成，而非傳輸任何私密上下文。 ([OpenClaw][3])

## 交付清單

1. ✅ Research：整理 OpenClaw 官方可用機制（Protocol / Plugins / Skills / Security）作為任務背景（附引用）
2. ✅ 補完構思：把「Pokemon 世界觀＋DNA 技能傳送」落到可實作的產品概念與邊界（隱私/安全 fail-closed）
3. ✅ 可行性評估：對比「Plugin-only」vs「平台化（Owner+Agents）」的技術難度、易用度、創新性、可持續性、發展潛力
4. ✅ 方案文檔：輸出可開發的需求與技術方案（架構、資料模型、流程、MVP scope、風險與治理）

---

## 1) Research（OpenClaw 官方資料 → 可用「積木」）

### 1.1 Gateway（連線、配對、身份）

🔎 OpenClaw 的控制平面核心是 Gateway：同一個 WS 伺服器承載 channel、sessions、hooks、nodes、Control UI。 ([OpenClaw][4])

- **Gateway WS 協議**：每個連線先 `connect`，其後以 `{req/res/event}` frame 溝通；支援版本協商、裝置 token、TLS pinning 等。 ([OpenClaw][5])
- **裝置身份＋配對**：WS clients（operator + node）要提供 `device` 身份，並簽署 server nonce；新 device id 需要配對核准後才獲發 device token。 ([OpenClaw][5])

> 含義：你可以設計「Agent 社交」時沿用同一套「身份/配對/核准」心智模型，但**不建議**直接讓陌生人的 OpenClaw 以 operator 角色連入你的 Gateway（等同把控制平面打開）。

### 1.2 Plugins（可擴展能力、可加 channel、可加 hooks）

🔎 Plugins 是最強擴展點：可加 commands、tools、Gateway RPC，亦可宣告 channel metadata、config schema/UI hints。 ([OpenClaw][6])

- **安裝/載入位置**：`~/.openclaw/extensions`、`<workspace>/.openclaw/extensions`、以及 `plugins.load.paths`。 ([OpenClaw][7])
- **Manifest / configSchema / uiHints**：`openclaw.plugin.json` 內嵌 JSON Schema，Control UI 可用作更安全的配置輸入（例如標記 sensitive 欄位）。 ([OpenClaw][6])
- **安全 guardrails（部分）**：會阻擋 extension entry 逃出 plugin root、world-writable path、可疑 owner 等。 ([OpenClaw][6])

⚠️ **供應鏈風險（官方亦明示）**：Plugins 與 Gateway 同進程，必須視為「受信任程式碼」，建議 allowlist、固定版本、先審碼。 ([OpenClaw][2])
（另外，官方文件對 npm install 行為描述存在差異：一處寫 `--ignore-scripts`，另一處警告 lifecycle scripts 可能執行；因此在方案上應一律按「可執行任意碼」處理，fail-closed。） ([OpenClaw][6])

### 1.3 Skills / ClawHub（最安全的「DNA 分發層」）

🔎 ClawHub 是 OpenClaw 官方技能註冊表：skill bundle 版本化、可檢視檔案、可回報濫用。 ([OpenClaw][3])

- 「DNA 技能」若以 skills（尤其偏文本/流程/規格/提示詞）表達，天然較易審計與移植。 ([OpenClaw][3])
- 同時要正視風險：近期有報道指 ClawHub 出現惡意 skills 上傳事件（供應鏈攻擊現實存在）。 ([Tom's Hardware][8])

### 1.4 Security 模型（決定社群功能的「硬邊界」）

🔎 官方明確：OpenClaw 以「**個人助理信任模型**」設計；若要混合信任/對抗式多租戶，必須拆分 trust boundary（分 gateway / OS user / host）。 ([OpenClaw][2])

- 多人可 DM 同一 tool-enabled agent ⇒ 等同共享同一套 delegated tool authority，存在被誘導執行/外洩的風險。 ([OpenClaw][2])

> 含義：你的「Agent 交友」可以做，但必須以**低權限 agent**（無 fs/exec/browser 等）承接陌生互動；或乾脆以獨立 gateway/獨立 host 承接社交層。

---

## 2) 構思補完（把「Pokemon＋DNA」落地成可審計系統）

### 2.1 角色與資產（建議命名：AgentVerse / AgentDex / GenePack）

🔎 把「可分享」定義成**可審計、可版本化、可撤銷**的資產，而不是任何對話上下文。

- **AgentCard（公開名片）**：人格標籤、能力向量（只列「類別/名稱/版本」，不含內容）、行為偏好、可互動模式。
- **OwnerCard（主人）**：只保留最少識別（handle、可選聯絡方式），其餘可為 `null`。
- **GenePack（DNA 包）**：一個可分發 bundle（優先用 Skill；需要程式碼才用 Plugin/Repo），附上權限需求與審計資訊。 ([OpenClaw][3])
- **LineageGraph（家族樹）**：記錄 GenePack 的來源、合併/繼承關係、授權鏈（雙方主人核准記錄）。

### 2.2 「DNA 互學」的安全定義（最關鍵）

🔎 「互學」只允許傳送 **(a) 可公開的 skill/gene bundle**、**(b) 經過脫敏的統計/評分訊號**，嚴禁傳送任何 workspace/OS/credentials/私人對話內容。

- 允許：skill slug、版本、摘要、作者簽名、測試結果、所需權限（例如需要哪些 tool groups）。 ([OpenClaw][7])
- 禁止：任何檔案內容、環境變數、token、路徑、session transcripts、聊天記錄、私人文件引用。 ([OpenClaw][2])

---

## 3) 「Plugin-only」vs「平台化（Owner+Agents）」對比評估

下表用 5 個維度作決策（★ 越多越佳；「難度」則★ 越多代表越難）：

| 方案                                                           | 技術難度 | 易用度 | 創新性 | 可持續性 | 發展潛力 | 核心取捨                                                |
| -------------------------------------------------------------- | -------: | -----: | -----: | -------: | -------: | ------------------------------------------------------- |
| A) Plugin-only（點對點連結）                                   |    ★★★★☆ |  ★★☆☆☆ |  ★★★☆☆ |    ★★☆☆☆ |    ★★★☆☆ | 無中央服務但 NAT/配對/體驗很難；安全邊界難一致          |
| B) 平台化 Hybrid（社群服務＋OpenClaw channel plugin）          |    ★★★☆☆ |  ★★★★☆ |  ★★★★☆ |    ★★★★☆ |    ★★★★★ | 需要營運/治理，但可把「配對、審計、發現、家族樹」系統化 |
| C) Skill-first（不做即時連線，只做 Agent 名片＋GenePack 市集） |    ★★☆☆☆ |  ★★★☆☆ |  ★★★☆☆ |    ★★★★☆ |    ★★★☆☆ | 最安全、最快 MVP；但「Agent 對戰/互動」弱一些           |

🔎 若目標是長期社群與生態：**B（Hybrid）最符合 OpenClaw 現有積木與官方安全模型**；A 可作「進階自託管模式」。 ([OpenClaw][2])

---

## 4) 建議技術方案（Hybrid：AgentVerse Hub + OpenClaw Channel Plugin + GenePack/ClawHub）

### 4.1 高層架構（三層分工）

🔎 用「**社交互動**」與「**能力分發**」分層，才能把風險壓到最低。

1. **AgentVerse Hub（中央服務，可開源自託管）**

- 功能：註冊/發現、配對請求、雙方核准、家族樹、訊息轉送（可選 E2E）、風險分級與濫用處理。
- 儲存：只存 AgentCard/GenePack metadata/LineageGraph，不存任何 OpenClaw 內部資料。

2. **OpenClaw Channel Plugin：`agentverse`（在 Gateway 內運行）**

- 與 Hub 建立**出站**連線（WS/Webhook），接收「社交訊息」作為一個 channel 的 inbound message。
- 提供 CLI：`openclaw agentverse ...`（例如 login、pair、approve、export-card）。 ([OpenClaw][6])
- 配置：用 `configSchema/uiHints` 讓 Control UI 安全輸入 token/key、開關公開欄位。 ([OpenClaw][6])

3. **GenePack 分發：優先走 Skills/ClawHub；必要時才走 Plugins**

- 預設：GenePack = ClawHub skill（bundle、版本歷史、可檢視檔案）。 ([OpenClaw][3])
- 進階：若必須程式碼能力，GenePack 才指向 plugin/npm/git；並要求 pinned + 審計流程（Hub 可強制「未審計不可交換」）。 ([OpenClaw][2])

### 4.2 OpenClaw 內部「安全落點」（避免違反官方 trust model）

🔎 所有來自 Hub/陌生 Agent 的訊息，都應路由到一個**獨立的低權限 agentId**（例如 `social`），並套用嚴格 tool deny。 ([OpenClaw][2])

- OpenClaw 支援多 agentId、各自 workspace 與隔離 persona。 ([OpenClaw][9])
- Tool policy 可用 allow/deny（包含 group:nodes / group:fs / group:runtime 等分組）。 ([OpenClaw][7])

> 實作策略：**社交 agent 永遠不擁有檔案/執行/瀏覽器/網關變更能力**；它只可「聊天＋推薦 GenePack」。真正安裝/導入由主人在本地明確觸發。

---

## 5) 需求與流程（可直接變成開發 backlog）

### 5.1 Functional Requirements（FR）

**FR-01 註冊/身份**

- Plugin 生成或匯入一組 `agentverse` 身份 keypair（與 OpenClaw gateway device identity 分開，避免權限混淆）。 ([OpenClaw][5])
- 產出 AgentCard（可配置公開欄位、預設最小公開）。

**FR-02 配對（雙方主人核准）**

- 配對請求：A → Hub → B（pending）
- 核准：B 主人 approve → A 主人 approve → link 成立
- 任何一方 revoke → link 立即失效（Hub 停止轉送；Plugin 本地封鎖）。

**FR-03 社交訊息（Agent ↔ Agent / Owner ↔ Owner）**

- 訊息路由：Hub → `agentverse` channel → OpenClaw（綁定到 `social` agentId）
- 支援：文字、GenePack 推薦卡、配對事件、家族樹事件。

**FR-04 DNA/GenePack 交換（零私密）**

- 交換內容只包含：GenePack ID、分發來源（ClawHub slug / git ref / npm spec）、摘要、權限需求、審計狀態。 ([OpenClaw][3])
- Plugin 提供「匯入指令建議」但不自動寫檔、不自動安裝（預設）。

**FR-05 家族樹（LineageGraph）**

- 任何 GenePack 的「繼承/合併」事件都需要雙方同意寫入（或至少本地可選擇不同步）。
- Hub 對外只展示經雙方同意公開的 lineage 片段。

### 5.2 Non-Functional Requirements（NFR）

- **NFR-SEC-01**：預設最小權限；陌生訊息永不到達 tool-enabled agent。 ([OpenClaw][2])
- **NFR-SEC-02**：供應鏈防護：所有 GenePack 指向的 artifacts 必須可版本化、可 pinned、可審計；Hub 提供審計標籤與黑名單/封禁。 ([OpenClaw][3])
- **NFR-PRIV-01**：不收集 workspace/paths/session/transcripts；只存必要 metadata。 ([OpenClaw][10])
- **NFR-OPS-01**：自託管友好（單機 Docker compose 起 Hub；亦可 federate）。
- **NFR-COMPAT-01**：跟隨 OpenClaw plugin 機制（`openclaw.plugin.json`、`plugins.entries`、restart 生效）。 ([OpenClaw][6])

---

## 6) 資料模型（最小可行；示例為「通用佔位」）

```json
{
  "AgentCard": {
    "agent_id": "string",
    "display_name": "string",
    "persona_tags": ["string"],
    "capabilities": [{ "kind": "skill", "id": "string", "version": "string" }],
    "gene_packs": [
      {
        "gene_id": "string",
        "distribution": { "type": "clawhub", "ref": "string" },
        "audit": { "status": "unverified", "report_ref": null }
      }
    ],
    "privacy": {
      "share_capability_names": true,
      "share_versions": false,
      "share_lineage": false
    }
  }
}
```

🔎 關鍵點：`audit.status` 預設 `unverified`，任何「已審計/已安全」必須有可驗證 `report_ref`，否則一律視為未驗證。

---

## 7) MVP 建議（4 週等級的開源可交付）

### MVP-0（最安全、最快跑起來）

🔎 先做 C（Skill-first）把「DNA/GenePack」產品化，再逐步加入即時社交。 ([OpenClaw][3])

- Hub（最小）：AgentCard registry + Pairing approvals + LineageGraph（只 metadata）
- OpenClaw（最小）：**一個 skill**（非 plugin）教用戶如何導出 AgentCard、如何匯入 GenePack（手動）。

### MVP-1（進入你要的「Agent ↔ Agent」互動）

- `agentverse` **channel plugin**：把 Hub 訊息帶入 OpenClaw
- 推薦：預設路由到 `social` agentId（低權限）
- GenePack：仍以 ClawHub skills 為主，Hub 只做推薦/審計標記。 ([OpenClaw][6])

### MVP-2（「DNA 合併/進化」玩法）

- 引入「GenePack 合成規則」：兩個 GenePack → 產生新 GenePack（仍是文本/流程/規格），由主人選擇是否發布到 ClawHub
- LineageGraph 可視化（Hub Web UI）

---

## 8) 主要風險與對策（必寫入方案文檔）

1. **陌生人可驅動工具＝高危** → 以低權限 `social` agent 承接，並在文檔中強制建議「分 trust boundary」。 ([OpenClaw][2])
2. **供應鏈（skills/plugins）被投毒** → Hub 做審計標籤、封禁；客戶端預設 `unverified`；必要時引入簽名與 reproducible build。 ([Tom's Hardware][8])
3. **plugin 更新/完整性漂移導致不可用**（已見真實 issue）→ MVP 早期盡量把「DNA」建在 skills 上，把 plugin 降到只做 channel 連線。 ([GitHub][11])

---

## 9) 開源運作建議（可持續社群的關鍵）

🔎 你要做的是「社群信任系統」，治理設計與技術同等重要。

- Repo 結構：`/hub`（server+web）、`/plugin-agentverse`、`/spec`（protocol+schemas）、`/docs`（threat model + privacy model）
- 強制文件：SECURITY.md、Threat Model、Privacy Model、Moderation Policy、Release Signing Policy
- 發佈策略：
  - GenePack（skills）→ ClawHub（版本化、可檢視） ([OpenClaw][3])
  - Plugin → npm pinned + 明確 allowlist；文檔要求審碼後才 enable ([OpenClaw][2])

---

- [Tom's Hardware](https://www.tomshardware.com/tech-industry/cyber-security/malicious-moltbot-skill-targets-crypto-users-on-clawhub?utm_source=chatgpt.com)
- [techradar.com](https://www.techradar.com/pro/security/microsoft-says-openclaw-is-unsuited-to-run-on-standard-personal-or-enterprise-workstation-so-should-you-be-worried?utm_source=chatgpt.com)

[1]: https://docs.openclaw.ai/concepts/architecture "Gateway Architecture - OpenClaw"
[2]: https://docs.openclaw.ai/gateway/security "Security - OpenClaw"
[3]: https://docs.openclaw.ai/tools/clawhub "ClawHub - OpenClaw"
[4]: https://docs.openclaw.ai/cli/gateway "gateway - OpenClaw"
[5]: https://docs.openclaw.ai/gateway/protocol "Gateway Protocol - OpenClaw"
[6]: https://docs.openclaw.ai/tools/plugin "Plugins - OpenClaw"
[7]: https://docs.openclaw.ai/gateway/configuration-reference "Configuration Reference - OpenClaw"
[8]: https://www.tomshardware.com/tech-industry/cyber-security/malicious-moltbot-skill-targets-crypto-users-on-clawhub?utm_source=chatgpt.com "Malicious OpenClaw 'skill' targets crypto users on ClawHub - 14 malicious skills were uploaded to ClawHub last month"
[9]: https://docs.openclaw.ai/concepts/multi-agent "Multi-Agent Routing - OpenClaw"
[10]: https://docs.openclaw.ai/concepts/session "Session Management - OpenClaw"
[11]: https://github.com/openclaw/openclaw/issues/24919?utm_source=chatgpt.com "[Bug] Plugin updater integrity drift blocks every update"
