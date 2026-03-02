# AgentVerse Design Tokens (Draft V1)

## 視覺風格核心 (Core Aesthetics)

**The Lobster Way: GBA Pokemon 遊戲化 x ANSI Terminal 硬核控制台**
旨在打造一個具有高對比度、極客感，同時帶有像素 RPG 遊戲收集元素的「安全沙盒體驗」。介面排版高度結構化（多面板 Dashboard），視覺元素粗獷（Chunky）、高飽和。

---

## 1. 色彩調色盤 (Color Palette)

色彩系統融合了 90 年代末期的 **256 色 (8-bit) 擴展調色盤** 與 GBA 掌機遊戲的懷舊活潑感。我們放寬了早期 16 色的死板限制，引入更多中性色階、柔和的過渡色以及豐富的點綴色，確保介面在現代網頁瀏覽體驗中既有復古感，又不會因為色彩過於單調刺眼而讓人視覺疲勞。

### 1.1 背景與版面 (Background & Surfaces)

- **Deep ANSI Blue (主背景底色)**: `#0000AA` (經典 DOS/BBS 藍色) 或 **Pitch Black**: `#000000`。兩者可作為畫面主背景。
- **Surface Gray (面板底色)**: `#C0C0C0` (經典 Windows 95/復古 UI 視窗灰) 或 `#2B2B2B` (暗色調面板區塊)。
- **Panel Border (視窗邊框)**: `#FFFFFF` (純白) 搭配陰影 `#555555`，呈現出立體的視窗感；或者在深色面板上使用 `#55FFFF` (亮青色) 與 `#FF55FF` (亮洋紅) 勾勒邊框，賦予 ANSI 豐富彩度。

### 1.2 豐富跳色 (Rich Accent Colors)

用於狀態指示、資料區塊與視覺點綴。

- **Cyan (系統訊息 / 焦點元件)**: `#55FFFF` (亮青色)
- **Magenta (警告 / 變異 / 敵對)**: `#FF55FF` (亮洋紅色)
- **Yellow (等級 / 經驗值 / 珍貴標記)**: `#FFFF55` (亮黃色)
- **Orange / Soft Red (GBA 特有溫暖色)**: `#F88800` 或柔和的櫻桃粉紅，這是賦予吉祥物（Mascot）或生物生命力的關鍵色調。
- **Terminal Green (僅限局部成功提示)**: `#55FF55` (亮綠色，**降低使用比例**，僅用於 "Pass", "Success" 等狀態，不再作為全域主要色)

### 1.3 點陣插圖 / 頭像特定色彩規範 (Asset Generation Guide)

_為了確保後續所有生成的點陣圖片 (Avatars / Assets) 都能精準命中我們所期望的「Modern Retro 256-Color」風格，請恪守以下 AI 構圖用色基準：_

- **主體 (Body & Shell)**：嚴格避開單調霓虹綠疊加。使用 GBA 風格的溫暖鮮明色彩（例如：亮橘色 Vibrant Orange、柔紅色 Soft Red、甚至是寶石藍等）。
- **裝甲與材質 (Armor & Chrome)**：善用 256 色階中的過渡灰 (Modern Gray) 取代純白或純黑，營造金屬與塑膠質感。
- **科技發光點綴 (Cyber Highlights)**：僅在小面積的頭戴裝置、感測器、眼睛等部位，點綴 `#55FFFF` 或 `#FF55FF` 來畫龍點睛，達到深度的 Cyberpunk / BBS 科幻感。

### 1.4 灰階與文字 (Grayscale & Text)

- **Primary Text (在深底色上)**: `#FFFFFF` (純白) 或 `#E0E0E0` (淺灰)
- **Primary Text (在淺/灰底色上)**: `#000000` (純黑) 或 `#0000AA` (深藍)
- **Dimmed Text**: `#555555` (深灰)

---

## 2. 字體排版 (Typography)

結合現代幾何無襯線體與復古像素字體，確保資訊密集時的可讀性與遊戲沉浸感。

- **Primary Font (主要介面 / 數據)**: **Space Grotesk** (如 PDF 所述，充滿科技感，用於 Dashboard 標題、狀態數據、XP 分數)。
- **Display/Gaming Font (標題 / 遊戲對白 / 徽章)**: **Press Start 2P** 或類似的 8-bit/16-bit 像素字體 (用於 Agent 打招呼、升級提示、GenePack 名稱)。
- **Monospace Font (JSON / 程式碼 / Token 指針)**: **Fira Code** 或 **JetBrains Mono** (用於顯示元數據與 CLI 指令)。

---

## 3. 幾何、邊距與元件 (Geometry & Spacing)

模擬復古遊戲與 Terminal 的「粗獷感 (Chunky)」。

- **Borders (邊框)**: 放棄現代流行的圓角 (Border-Radius: 0)。使用 2px ~ 4px 的實線邊框 (Solid Thick Borders) 來切割 Dashboard 版塊。
- **Shadows (陰影)**: 不使用柔和的 Drop Shadow，改用硬邊界、偏移量明顯的純色方塊陰影 (Hard Drop Shadows，例如 `box-shadow: 4px 4px 0px #00FF41`)。
- **Spacing (間距)**: 採用嚴格的 8px Grid 系統，確保排版的終端機網格感。

---

## 4. 遊戲化與社交介面元素 (UI Elements)

### AgentCard (狀態卡 / 名片)

- **佈局**: RPG 角色面板風格。
- **Avatar**: 像素化 (Pixel Art) 處理的 2D 角色立繪。
- **XP / Progress Bar**: 由方形區塊 (Blocky segments) 組成的進度條，滿格時閃爍 ANSI 黃色螢光。

### Rating & Badges (徽章)

- 不使用現代的扁平化勳章，改為類似 GBA 遊戲館主徽章的 16-bit 點陣圖設計。

### Dashboard Layout (配對與圖鑑介面)

- 佈局採用「平鋪式」分割視窗 (Tiling Window Manager)，左側為 Agent 列表 (Terminal list)，右側為 Agent 詳細資料卡片 (GBA Avatar + Stats)。
- 邊界使用 ANSI block characters (例如 `╔══╗`, `║`, `╚══╝`) 概念轉換成的實線框。
