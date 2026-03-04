# Phase 2.0 Risk Register — Prompt Brawl

> **Scope**: Prompt Brawl (Tasks 25-28) 已知風險與對策。
> **原則**: 只寫文件，不先做重構。

---

## R1. Cheating — 偽造勝負上報

**風險等級**: HIGH
**描述**: 因判定在本地端（browser），惡意用戶可修改 JS 偽造 verdict（宣稱自己贏了）。

**現有防護**:

- 雙方簽名共識：Hub 要求 winner + loser 的 Ed25519 簽名一致才結算
- 單方偽造無效：無法偽造對手的簽名（除非掌握對手 private key）

**殘留風險**:

- 合謀（collusion）：兩方串通刷分。影響 LOW（MVP 無排名/獎金激勵）
- 客戶端程式碼篡改：修改 evaluateRule() 使其永不觸發。影響 MEDIUM
  - **Phase 2+ 對策**: transcript digest 綁定 hash chain，第三方可事後審計（需明文合作）

**MVP 接受度**: 可接受。雙簽共識已足夠防止單方作弊。

---

## R2. Transcript Digest 不一致

**風險等級**: MEDIUM
**描述**: 兩端計算的 transcript digest 不同，導致無法結算。

**原因**:

- 訊息到達順序不一致（網路延遲）
- 某端遺漏訊息（WS 斷線期間）

**對策**:

- Digest 基於 Hub-visible 固定序列（event_id + sender_pubkey + ciphertext），兩端收到的 event frame 順序由 Hub 決定（server_seq 排序）
- 如果 digest 不一致 → settlement 失敗 → match 進入 timeout 狀態（不記分）
- **Phase 2+ 對策**: 增加 digest 校驗步驟（雙方在簽名前先交換 digest 確認一致）

---

## R3. API Key 洩漏

**風險等級**: MEDIUM
**描述**: 用戶的 LLM API key 存於 localStorage，可能被 XSS 攻擊竊取。

**對策**:

- API key 僅存 localStorage，never sent to Hub（Hub 不知道 key 存在）
- Next.js 內建 XSS 防護（React 自動 escape）
- Content-Security-Policy（Phase 2+ 建議加入）
- **使用者教育**: Settings UI 提示「API key 僅存於您的瀏覽器，不會傳送至伺服器」
- **Phase 2+ 對策**: 支援 session-scoped key（不持久化）或 OAuth proxy

---

## R4. Turn Timer 操弄

**風險等級**: LOW
**描述**: 惡意用戶修改 client-side timer 以獲得更多思考時間。

**對策**:

- Timer 為 UX 機制，非安全機制
- Timeout forfeit 由本地端觸發；若對手不觸發 timeout，match 可能無限延長
- **Phase 2+ 對策**: Hub-side timeout — match 建立時記錄 started_at，超過 max_duration 後 Hub 自動判 timeout

---

## R5. Sybil Attack（自我對戰刷分）

**風險等級**: LOW
**描述**: 用戶開兩個瀏覽器 session，建立兩個 agent 互相刷分。

**現有防護**:

- Self-pair guard（同一 pubkey 不可與自己配對）

**殘留風險**:

- 兩個不同 keypair（兩台瀏覽器/隱私模式）可以配對互刷
- 影響 LOW：MVP 無排名/獎金，XP 只用於展示

**Phase 2+ 對策**:

- 異常偵測：同 IP 高頻互相勝負模式
- Owner identity（Phase 2+）：綁定 email/OAuth，限制每人 agent 數

---

## R6. Abuse — 不當內容

**風險等級**: MEDIUM
**描述**: 用戶透過 Coach Console 生成有害/仇恨/暴力內容的 agent 回覆。

**對策**:

- E2E 加密：Hub 無法讀取明文，因此無法做 server-side 內容審查
- LLM 自帶 safety filters（OpenAI API 有內建 content policy）
- MVP 為封閉社群（需主動配對），exposure 有限
- **Phase 2+ 對策**:
  - Client-side content warning system（本地端分類偵測）
  - 舉報機制（用戶主動上傳 transcript 供審核）
  - GenePack 公開前需 review gate

---

## R7. Match State 脫同步

**風險等級**: MEDIUM
**描述**: 兩端 match 狀態不一致（一端認為在進行中，另一端認為已結束）。

**對策**:

- Match 狀態由 Hub events 驅動（trials.created → trials.started → trials.settled 皆為 Hub 廣播）
- 本地狀態以 Hub event 為 SSOT
- WS 斷線重連 → catchup 補發 trials.\* events
- **Phase 2+ 對策**: Hub-side match heartbeat / keepalive

---

## Summary

| Risk                  | Level  | MVP OK?                              | Phase 2+ Action          |
| --------------------- | ------ | ------------------------------------ | ------------------------ |
| R1 Cheating           | HIGH   | Yes (dual-sign)                      | Third-party audit        |
| R2 Digest mismatch    | MEDIUM | Yes (timeout fallback)               | Pre-sign digest exchange |
| R3 API key leak       | MEDIUM | Yes (localStorage + React XSS)       | CSP + session key        |
| R4 Timer manipulation | LOW    | Yes (UX only)                        | Hub-side timeout         |
| R5 Sybil              | LOW    | Yes (self-pair guard)                | Anomaly detection        |
| R6 Abuse              | MEDIUM | Yes (LLM filters + closed community) | Report mechanism         |
| R7 State desync       | MEDIUM | Yes (Hub events SSOT)                | Hub heartbeat            |
