# AgentVerse UI/UX 與視覺設計提案

## 1. 任務範圍與我的貢獻 (Scope of Work)

根據 `.kiro/specs/agentverse/` 下的 `requirements.md`, `design.md`, 與 `tasks.md`，我將做為專業設計師負責以下範圍的研究、規劃與設計：

### A. 基礎視覺與 Design System (設計系統)

- **Token 系統設計**：制定色彩計畫 (Color Palette)、字體排版 (Typography，相容 `Space Grotesk` 與復古字型)、間距與 UI 邊框規則。
- **介面佈局 (Layout)**：設計 Web UI 的 AgentDex 圖鑑瀏覽框架、搜尋結果列，以及配對 (Pairing) 的操作流程介面。

### B. MVP 資產包 (Asset Pack - `mvp-default`)

由於平台需要一套零依賴的內建視覺，我將使用 `nanobanana` 進行批量資產設計，包含：

- **Avatars (頭像)**：提供不同 Agent 的預設點陣圖或復古風格頭像。
- **Badges (成就徽章)**：為 Trials 試煉結果設計專屬圖示 (如 First Pair, First Trial 等標章)。
- **Card Frames (卡牌邊框)**：AgentCard 的專屬外框設計。
- **Backgrounds (背景圖)**：AgentDex 的主題背景 (例如掃描線、CRT 螢幕、控制面板背景)。

### C. 遊戲化體驗與社交體驗 (UX Design)

- **硬核安全的視覺化**：將端到端加密 (E2E)、本機隔離等抽象技術，轉化為視覺上具備「安全沙盒感」的互動回饋。
- **AgentCard 狀態卡**：規劃 XP、等級、能力的資訊層級，結合類似 RPG 角色卡片的呈現方式。

---

## 2. 初步視覺風格提案 (Visual Style Concepts)

為符合 AgentVerse 的「The lobster way」精神、極客/CLI 文化，並融合 GBA 遊戲化與 90 年代復古電腦風格，我生成了三款不同方向的概念圖供您評估。

請檢視以下方向，告訴我您最偏好哪一種，或是希望混合哪些元素：

### Option A: GBA Pokemon 像素遊戲風

結合了 Game Boy Advance 的點陣像素風格，呈現出輕鬆、可收集 (Pokemon-like) 的遊戲感，同時保持了綠色/黑色的終端機配色與 Cyberpunk 元素。
![GBA Pokemon 風格](./concept_gba_pokemon_1772356876202.png)

### Option B: 1990s Retro PC / Windows 95 風格

融合了 90 年代復古電腦介面 (立體倒角邊框、灰色粗糙視窗) 與 MS-DOS 元素。帶有強烈的「駭客/網路安全監控面板」氛圍與 CRT 掃描線，非常適合表達隔離與沙盒感。
![Retro PC 風格](./concept_90s_retro_pc_1772356889171.png)

### Option C: 鐵派 ANSI Terminal / BBS 風格

極致的極客色彩，全畫面由 ASCII/ANSI 區塊構成，強烈的高對比霓虹色 (螢光綠、青色、品紅)。適合給深度 CLI 用戶帶來最原汁原味的終端指令列沈浸感。
![ANSI Terminal 風格](./concept_ansi_terminal_1772356905953.png)

---

## 3. 下一步 (Next Steps)

這是一步一步來的設計流程，目前的阻擋點需要您的回饋：

1. 請您**選擇一個方向 (Option A, B, 或 C)**，或是提出混合建議 (例如：B 的視窗框 + A 的角色)。
2. 確定大方向後，我將開始輸出詳細的 `Design Tokens` (調色盤、字體設定)。
3. 接續設計實用的 `AgentCard` 佈局與組件。

---

## 4. 視覺迭代更新 (Update: The 256-Color Modern Retro Palette)

根據後續與使用者的討論反饋，我們確認**純 16 色 ANSI 調色盤過於死板且容易造成視覺疲勞**。
因此，設計系統已正式升級為：**GBA 柔和視窗風格 + 90 年代 256 色 (8-bit) 擴充調色盤**。

這允許我們使用更豐富的中性灰色、深海藍底色，以及多層次的點綴色（而不僅僅是刺眼的駭客綠），以符合現代網頁瀏覽的舒適度，同時完美維持 Pixel Art 的復古精神。詳細色碼請見更新後的 `design_tokens.md`。
