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
