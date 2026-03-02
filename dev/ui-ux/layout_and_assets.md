# AgentVerse UI/UX: Layouts & MVP Assets (GBA x ANSI Hybrid)

為了符合您選擇的 **GBA Pokemon 柔和灰階視窗 + 256 色 (8-bit) BBS 儀表板排版** 混合風格，我們對所有視覺與素材進行了現代化復古升級（Modern Retro 256-Color Palette）。

以下為設計成果：

---

## 1. 介面佈局設計 (Web UI Layouts)

### AgentDex (圖鑑與探索面板)

將復古終端機的資料夾列表結構（左側）與 GBA 寶可夢圖鑑的角色詳細資料卡（右側）完美結合。大量使用舒適的 256 色階過渡、深色底底圖與灰/白窗框，保留了極客感但大幅降低了單調駭客綠帶來的視覺疲勞。
![AgentDex Layout](./layout_agentdex_hybrid_1772358131628.png)

### 配對請求彈窗 (Pairing Request Dialog)

以 MS-DOS 視窗的粗實線邊框繪製交互彈窗。按鈕使用 `[ ACCEPT ]` 與 `[ DENY ]` 這種純文字包覆結構，搭配鮮豔的綠色與洋紅色，在深色背景中提供極高的警示度與操作明確性，符合我們對於「授權審批」的安全感要求。
![Pairing Dialog](./layout_pairing_hybrid_1772358149169.png)

---

## 2. MVP 資產包 (Asset Pack - `mvp-default`)

這些靜態圖片資產將作為開放原始碼專案的內建預設素材，無需外部工具即可顯示。
完整的定義檔已放在同資料夾下的 `manifest.json` 中。

| 資產類型              | 預覽                                                                  | 說明                                            |
| :-------------------- | :-------------------------------------------------------------------- | :---------------------------------------------- |
| **復古頭像 (Avatar)** | <img src="./asset_avatar_01_1772358009681.png" width="150">           | "The lobster way" 賽博龍蝦駭客，256 色像素風格  |
| **UI 視窗框 (Frame)** | <img src="./asset_ui_frame_ansi_1772357990818.png" width="150">       | 多立體倒角，具有亮青/品紅硬陰影的復古邊框       |
| **成就徽章 (Badge)**  | <img src="./asset_badge_01_1772358042055.png" width="150">            | 例如 First Pair 等成就的解鎖標誌，亮黃/白對比色 |
| **掃描線背景 (Bg)**   | <img src="./asset_background_scanline_1772358053321.png" width="150"> | 作為全螢幕基底的 CRT 顯示器紋理                 |

---

## 3. 下一步 (Next Steps)

1. 請確認這兩張 Layouts 與四張 Assets 是否符合您腦海中對這個項目的想像？
2. 如果以上的基礎風格確定後，我會繼續設計 Phase 3 所需的「Trials 遊戲化試煉」、「技能樹 (Skill Tree)」，以及相對複雜的「Fusion Lab (DNA 交換) / LineageGraph (血統樹)」。
