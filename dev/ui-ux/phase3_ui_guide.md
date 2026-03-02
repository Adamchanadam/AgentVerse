# AgentVerse Phase 3: Game & Social UI Concepts (Layout & CSS Proposals)

根據 MVP 階段確認的 **The Lobster Way (GBA Pokemon x ANSI Terminal 混合風格)** 視覺規範，以下提出針對未來 Phase 3 兩大核心功能「Trials Runner (本地試煉)」與「Fusion Lab / LineageGraph (血統樹)」在 Web UI 上的具體實作與 CSS 切版方向。

**此文件不包含 AI 模型生成的假想圖，所有視覺建議均基於現有的 `design_tokens.md` 以及可透過前端技術（React/Tailwind/Vanilla CSS）達成的方案。**

---

## 1. Trials Runner (本地試煉分數面板)

**功能目標：** 呈現 Agent 的可重播能力評測結果（可靠度、治理能力、效率、安全度），並賦予通過（Pass）或不穩定（Unstable）的成就感回饋。

### 1.1 介面佈局 (Layout Structure)

- **滿版框架：** 以經典 BBS 深藍 (`#0000AA`) 或純黑 (`#000000`) 為底，加上微弱的掃描線 (`bg_agentdex_tile.png`) 鋪底。
- **模態視窗 / 中心卡片：**
  - 外部邊框套用 `frame_basic.png` 作為 CSS `border-image` 或 `background`，尺寸 320x180（可依比例放大），無圓角。
  - 內部底色可選用復古灰 (`#C0C0C0`) 或深色 (`#2B2B2B`)。
- **標題區 (Header)：** 使用像素字體 (`Press Start 2P`)，色彩使用活潑的亮黃色 (`#FFFF55`)，標題諸如 "**TRIAL REPORT: PASS**"。
- **核心視覺 - 雷達圖 (Radar Chart)：**
  - 捨棄複雜的開源圖表庫預設樣式，由前端 (Canvas / SVG) **手繪像素感雷達圖**。
  - **網格 (Grid)：** 純白 (`#FFFFFF`) 或青色 (`#55FFFF`) 實線，無反鋸齒。
  - **填色 (Fill)：** 半透明品紅或亮黃色 (`rgba(255, 85, 255, 0.4)`)，外框線為極亮的白色。
- **數據區 (Stats List)：** 在雷達圖右側或下方。
  - 使用 monospace 字體 (`Fira Code`)。
  - 例如：`> RELIABILITY .... 98%`
- **認證印章 (Approval Stamp)：**
  - 若分數達標（State = Verified），蓋上純文字構成的 ASCII/ANSI 印章，例如：
    ```text
    [ APPROVED ]
     #00FF41
    ```

### 1.2 相關 CSS 技巧示範 (Design Token 映射)

```css
/* Trials 雷達圖框架示例 */
.trials-card-container {
  background-color: var(--deep-ansi-blue, #0000aa); /* BBS 經典藍底 */
  border: 4px solid var(--panel-border, #ffffff); /* 純白硬邊框 */
  box-shadow: 4px 4px 0px var(--cyan-accent, #55ffff); /* 青色硬陰影，色彩豐富 */
  font-family: "Space Grotesk", sans-serif;
  color: var(--primary-text, #ffffff);
}

.trials-header-text {
  font-family: "Press Start 2P", monospace;
  color: var(--yellow-accent, #ffff55); /* 亮黃色取代單調綠色 */
  text-shadow: 2px 2px 0px #000; /* 凸顯像素立體感 */
}
```

---

## 2. Fusion Lab & LineageGraph (基因實驗室與血統樹)

**功能目標：** 呈現 GenePack（DNA能力包）的雙親繼承關係，以及允許使用者拖曳兩個技能進行合成預覽。

### 2.1 介面佈局 (Layout Structure)

- **分割視窗 (Split Pane)：**
  - **左側：Fusion Lab 托盤 (Deck)** - 顯示目前擁有的 GenePacks (小尺寸像素卡片形式)。
  - **右側主畫面：LineageGraph (家族樹畫布)** - 一個可互動的圖表空間。
- **圖表節點設計 (Node Styling - 針對 Cytoscape / React Flow)：**
  - **形狀：** 絕對方正的矩形 (Border-radius: 0)。
  - **外框線：** 未驗證 (Unverified) 使用洋紅色 (`#FF55FF`)；已驗證 (Verified) 使用亮青色 (`#55FFFF`) 或純白 (`#FFFFFF`)。
  - **節點內容：** 只顯示縮寫（如 `G-01`），點擊後展開多彩 ANSI 風格的 Metadata 浮動面板。
- **連線設計 (Edge Styling)：**
  - **線條種類：** `step` 或 `straight` (直角連線，符合 ANSI 排版風格，絕不使用貝茲曲線 `bezier`)。
  - **雙方批准標誌：** 在連線上加入一個小的鎖頭圖示 (`[🔒]`)，代表該基因傳承經過雙方主人簽名。
- **合成台 (Fusion Preview)：**
  - 當選中兩個節點時，畫面上方出現一塊 ANSI 對話框（類似 MS-DOS 訊息框）。
  - 顯示預測衝突的程式碼片段：`> PREDICTING COLLISION... OK.`

### 2.2 React Flow / Cytoscape 主題配置建議

在前端實作家族樹時，圖表庫的主題設定必須強制覆寫：

```javascript
// React Flow 樣式限制範例
const nodeStyle = {
  background: "#C0C0C0" /* 復古 GBA/Win95 淺灰實體感 */,
  border: "2px solid #FFFFFF" /* 立體視窗亮邊 */,
  borderBottom: "2px solid #555555",
  borderRight: "2px solid #555555",
  borderRadius: "0px",
  color: "#0000AA" /* 深藍色文字 */,
  fontFamily: '"Fira Code", monospace',
  boxShadow: "4px 4px 0px #FF55FF" /* 洋紅色裝飾陰影，呈現賽博龐克豐富度 */,
  padding: "10px",
};

const edgeOptions = {
  type: "step", // 強制直角折線
  animated: false, // 若要模擬資料流，可改 true
  style: { stroke: "#AAAAAA", strokeWidth: 2 },
};
```

---

## 3. 下一步確認 (Next Steps)

這份文件確立了將來前端 (Claude Code) 實作 Phase 3 時，必須遵循的「非視覺生成圖像」實作規則：**依靠 CSS、字體與 SVG 畫布手繪，避免依賴外部圖片，達成極致輕量的 GBA x ANSI 風格。**

如果這份「架構與切版方針」有符合您對於 Phase 3 的想像，我便會將這份文件歸檔作為前端開發的指南。（這份文件存放於 `ref_doc/uiux_design_ref/phase3_ui_guide.md`）。
