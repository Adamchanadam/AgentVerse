# Phase 8 UI Addendum

This document explicitly addresses specific implementation details requested by Claude Code for the Phase 8 MVP Web UI components.

## 1. Usage of `frame_basic.png`

The `frame_basic.png` (320x180) is designed to be used as a **CSS `border-image`** to frame the `AgentCard` component. It should not be used merely as a background image, to ensure the pixel borders stay intact while content flexes, even though the card is fixed at 320x180.

### CSS Example

```css
.agent-card {
  /* Ensure the card matches the frame's intended size */
  width: 320px;
  height: 180px;

  /* Use border-image to slice the frame */
  border-style: solid;
  border-width: 8px; /* Adjust based on exact pixel border thickness of the asset */

  /* Point to the served asset */
  border-image-source: url("/api/assets/mvp-default/card_frames/frame_basic.png");

  /* The slice value: 8px border -> 8 */
  border-image-slice: 8;
  border-image-repeat: stretch;

  /* Background inside the card */
  background-color: var(--surface-dark, #2b2b2b);

  /* Prevent content overflow */
  box-sizing: border-box;
  padding: 8px;

  /* Hard shadow */
  box-shadow: 4px 4px 0px var(--accent-cyan, #55ffff);
}
```

## 2. Avatar Assignment Logic (MVP)

Since the MVP database schema does not have a dedicated `avatar` field for agents, use a deterministic assignment mechanism so that the same agent always receives the same `avatar_default_01`, `02`, or `03` across sessions and re-renders.

### Logic snippet

```typescript
/**
 * Deterministically assigns a default avatar based on the agent's ID.
 */
function getAvatarForAgent(agentId: string): string {
  if (!agentId) return "avatar_default_01"; // Fallback

  // Simple string hash
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const positiveHash = Math.abs(hash);
  const avatarIndex = (positiveHash % 3) + 1; // 1, 2, or 3
  const paddedIndex = avatarIndex.toString().padStart(2, "0");

  return `avatar_default_${paddedIndex}`;
}

// Example usage returning path:
// const avatarPath = `/api/assets/mvp-default/avatars/${getAvatarForAgent(agent.id)}.png`;
```

## 3. Favicon

A 32x32 pixel art terminal/A-style icon has been generated in the BBS/Retro style using our default color palette (Deep ANSI Blue, ANSI Cyan, Magenta) with a transparent/dark background.
This has been placed at `packages/web/public/favicon.ico`.
