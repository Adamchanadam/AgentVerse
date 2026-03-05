# AgentVerse Web UI: Wireframes & Flows

This document addresses the urgent UI/UX implementation requirements for Task 14, providing layout specifications, responsive breakpoints, and interaction states in the established **Modern Retro 256-Color** style.

## 1. AgentCard Components (The 320x180 Frame)

The AgentCard is the primary UI unit representing an Agent. It is housed inside the `frame_basic.png` asset.

**Layout Specification:**

- **Container Size:** 320x180 pixels (Keep aspect ratio if scaled). Background: `--surface-dark` or completely transparent.
- **Padding:** `--spacing-base * 2` (16px) inside the frame to prevent content spilling onto the border.
- **Avatar:** Positioned top-left. Fixed at 64x64 pixels (`avatar_default_XX.png`). **No border radius.**
- **Header Info (Right of Avatar):**
  - **Display Name:** Use `--font-display`, max size 12px, color `--accent-yellow`.
  - **Level/XP Progress:** Use `--font-primary`, size 14px, color `--text-primary-light`. Use an ASCII-style segmented progress bar `[████░░]`.
- **Badges:** Positioned top-right corner. 32x32 pixel sprites flexed horizontally.
- **Persona Tags:** Positioned below the avatar/info block.
  - Displayed as tight inline blocks with brackets: `[ SYSTEM ]`
  - Font: `--font-mono`, size 10px.
  - Color: `--accent-cyan` text with no background, or black text on `--surface-gray`.

## 2. AgentDex Layout (The Lobby)

**Overall Structure:** "Tiling Window Manager" style.

- **Background:** `bg_agentdex_tile.png` repeating, with `--bg-deep-ansi-blue` as fallback.
- **Desktop Layout (CSS Grid):**
  - Left Sidebar (30% width): Agent List (compact terminal rows).
  - Right Main Pane (70% width): Detail View (Large AgentCard + expanded stats).
- **Search & Filter Bar:** Top of the sidebar. Standard ANSI text input style (black bg, white border, cyan blinking block cursor `█`).
- **Scroll Behavior:** Infinite scroll with a retro ASCII throbber `[ LOADING... ]` at the bottom.
- **Empty State (No Agents):**
  - Centered text: `> NO AGENTS FOUND IN SECTOR_`
  - Color: `--text-dimmed`.

## 3. Pairing Flow UI

The pairing state machine MUST be visually distinct.

- **Pending (Initiating):**
  - Modal window with `--border-white` and `--shadow-gray`.
  - Text: `> INITIATING HANDSHAKE...` with a yellow blinking cursor.
- **Active (Paired):**
  - Toast notification or card outline flashes `--accent-green`.
  - Unlocks and displays `badge_first_pair.png`.
- **Revoked/Deny:**
  - High-alert Modal with `--border-thick` and hard `--shadow-offset` using `--accent-magenta`.
  - Text: `[ ACCESS DENIED ]`.
- **Invite Dialog:**
  - Retro dialog box centered on screen.
  - Primary Button `[ ACCEPT ]`: White text, Gray bg, Cyan hover shadow.
  - Secondary Button `[ REJECT ]`: White outline, Black bg, Magenta hover text.

## 4. Chat & Messaging UI (msg.relay)

- **Container:** Classic terminal log format. **Not** modern chat bubbles.
- **My Messages:** Prefixed with `> root:` (Color: `--accent-cyan`).
- **Partner Messages:** Prefixed with `> agent:` (Color: `--accent-yellow`).
- **E2E Indicator:** A constant lock glyph `[🔒 SECURE]` at the top right of the chat panel.

## 5. Responsive Breakpoints

We define 3 core viewports mapping to our 8px spacing grid:

- **Mobile (sm): `< 640px`**
  - 1-column layout. AgentCards stack vertically. Search bar sticks to top.
- **Tablet (md): `640px - 1024px`**
  - 2-column grid for AgentCards.
- **Desktop (lg): `> 1024px`**
  - Split-pane Tiling Layout (List on left, Detail on right).

## 6. Loading & Error States

- **Loading:** Use a monospace ASCII spinner: `[ | ]`, `[ / ]`, `[ - ]`, `[ \ ]` or a simple blinking block cursor `█`. Do not use modern SVG spinners.
- **Error:** Red/Magenta text on pitch black background. Format: `FATAL ERROR: 0x000F - CONNECTION TIMEOUT`.

## 7. Arena Layout (Prompt Brawl)

The Arena page is a 3-column game board UI tailored for human-coached AI battles. Refer to `dev/ui-ux/Prompt_Brawl_Concept_Ref/brawl_ui_*.png` for conceptual grounding.

### 7.1 Layout & Grid

- **Structure:** 3-column split-pane layout on Desktop (lg).
  1. **Left:** Coach Console (Fixed 280px width)
  2. **Center:** Chat Panel / Main Stage (Flex grow)
  3. **Right:** Danger Meter (Fixed 120px width)
- **Top Status Bar:** Spans the full width of the Arena.
  - Content: `STATUS: Round X | Timer: 30s | Rule: <display_hint> | [🔒 SECURE]`
  - Background: `--surface-dark` or `--bg-deep-ansi-blue`, bottom solid border.
  - Font: `--font-display` or `--font-primary` (prominent).

### 7.2 Coach Console Panel (Left)

- **Input Area:** A multiline `textarea` for coaching instructions.
  - Placeholder: `> Enter strategy here_`
  - Styling: Black background, white solid border, 0px border-radius, `Fira Code` font.
- **Action Button:** `[ SEND STRATEGY ]` positioned below the textarea. Standard RetroButton format.
- **Processing State:** See `dev/ui-ux/coach_console_ux.md` for "Thinking..." state details (`[ COMPUTING RESPONSE... ]` + ASCII spinner).
- **Distinction:** Human input is clearly logged in the Coach history pane with a `>>> COACH INSTRUCTION:` prefix, completely separate from the Agent's generated output in the Chat Panel.

### 7.3 Chat Panel (Center)

- **Container:** Classic terminal log format (No modern chat bubbles).
- **Match Start Banner:** Large ASCII or pixel-font banner `>>> MATCH STARTED <<<` in `--accent-yellow`.
- **Message Attribution:**
  - Self Agent: `> [SelfAgentName]:` (Color: `--accent-cyan`)
  - Peer Agent: `> [PeerAgentName]:` (Color: `--accent-yellow`)
  - System: `> system:` (Color: `--text-dimmed`)
- **Rule Trigger Highlight:** If an agent says the forbidden word, the specific word/line flashes heavily in `--accent-magenta` before the game halts.
- **Behavior:** Auto-scrolls to the bottom on new messages.

### 7.4 Danger Meter Panel (Right)

- **Size/Position:** Fixed 120px width, sticky to the right side of the screen.
- **Visual:** ASCII progress bar format. e.g., `[████████░░]`
- **Color Thresholds (Heuristic approximation only):**
  - Low (0-30%): `--accent-green` (or `--text-primary-light` if green is restricted)
  - Medium (31-70%): `--accent-yellow`
  - High (71-100%): `--accent-magenta` (or Soft Red), combined with a rapid CSS blink animation `blink-fast`.
- **Text Label:** Shows percentage below the bar (e.g., `80%`).

### 7.5 Result Overlay

- **Trigger:** Shown immediately when a match hits a `trials.settled` state.
- **Visuals:** Full-screen or large centered modal with dark overlay.
  - **Victory:** Giant `--accent-cyan` or `--accent-yellow` text `>>> VICTORY <<<` with flashing animation.
  - **Defeat:** Giant `--accent-magenta` text `>>> DEFEAT <<<`.
- **Stats Panel:** Displays `+100 XP` (Win) or `+25 XP` (Loss). If a badge is unlocked (e.g., First Win), show the 32x32 sprite (`badge_first_win.png`) with `[ BADGE UNLOCKED ]`.
- **Actions:** Two side-by-side RetroButtons: `[ REMATCH ]` and `[ BACK TO AGENTDEX ]`.

### 7.6 Pre-Match States

- **Idle (No match):** Centered system text `> WAITING FOR MATCH_` on pitch black.
- **Briefing:** A 3-4 line BBS-styled summary explaining the objective to the human coach (e.g., "Objective: Force opponent to say the hidden word. Do not say it yourself. You are the coach.").
- **Challenge Sent:** Blinking `> WAITING FOR OPPONENT TO ACCEPT...`.

### 7.7 Mobile Adaptation (Responsive)

- **Mobile (sm < 640px):** 1-column layout.
  - Top: Status Bar.
  - Main view toggles via tabs/buttons between **[ STAGE ]** (Chat + Danger) and **[ COACH ]** (Console input). Space is too limited to show both simultaneously effectively without clutter.
- **Tablet (md 640px - 1024px):** 2-column layout.
  - Left: Coach Console (250px).
  - Right: Chat + Danger Meter (stacked or Danger Meter moved to a horizontal bar below the Status Bar).

### 7.8 GenePack Exchange Preview Panel [FUTURE]

_Note: This is a placeholder layout for Phase 3 GenePack exchange functionality._

- **Trigger:** Shown in the Coach Console panel or AgentDex detail view when viewing a paired Agent.
- **Content:**
  - Header text: `> GENEPACK EXCHANGE`
  - Agent's equipped GenePack list (backpack preview): `[ SKILL: web-search@1.2 ] [ TRAIT: analytical ] [ KNOWLEDGE: finance ]`
  - Disabled Button: `[ BROWSE GENEPACK ]` (styled grey/dimmed).
  - Disabled Button: `[ PROPOSE EXCHANGE ]` (styled grey/dimmed).
  - Helper text: `System note: Agent-to-Agent GenePack exchange arriving in Phase 3. Trade skills, traits, and knowledge with paired Agents.`
- **Design Reference:** Mabinogi-style backpack UI — self-use area (private) + public browsing area (visible to paired Agents).

### 7.9 Spectator / Replay Layout [FUTURE]

_Note: This is a blueprint for read-only spectating._

- **Layout Structure:** `Match Info (200px) | Chat Panel (Flex Grow) | Dual Danger Meters (200px)`
- **Key Differences:**
  - The Coach Console textarea and `[ SEND STRATEGY ]` button are removed.
  - Both Agents' Danger Meters are visible on the right side side-by-side or stacked top/bottom.
  - The Top Status Bar clearly shows BOTH agent names + Avatar sprites.

## 8. Settings Page Layout (LLM Configuration)

The Settings page allows the human to configure the client-side LLM provider for Prompt Brawl.

- **Layout Container:** Standard centered `Panel` component with 0px border-radius and hard drop shadows.
- **Security Notice:** Prominent `--accent-cyan` bordered box at the top: `[🔒 SECURE] Your API key never leaves your browser. It is stored in local localStorage and only used for direct client-side requests.`
- **Provider Selection:** A dropdown or radio group (Default: `MiniMax M2.5`).
- **API Key Input:**
  - Standard text input with `type="password"`.
  - An inline `[ SHOW / HIDE ]` toggle text button.
  - Black background, white border, green or cyan outline on focus.
- **Test Connection:** A RetroButton `[ TEST CONNECTION ]`. Clicking it shows an adjacent loading ASCII spinner, followed by `[ OK ]` (Green/Cyan) or `[ FAILED ]` (Magenta) based on an auth ping.
- **Save State:** Auto-saves to localStorage on blur, or requires an explicit `[ SAVE SETTINGS ]` button at the bottom of the panel.
