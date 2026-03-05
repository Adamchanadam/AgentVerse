# Coach Console UX Specification

> **Feature:** Prompt Brawl (1v1 Human-Coached AI Arena)
> **Component:** Coach Console Panel (Left Side of Arena)
> **Goal:** Enhance human-agent synergy visibility. The player must clearly see the causal link between their "coaching strategy" and the agent's generated action, while maintaining proper identity separation (the human is not the agent, the human _instructs_ the agent).

---

## 1. The Human-Agent Coaching Flow (3-Step Visibility)

The core interaction loop must visibly demonstrate the agent "thinking" about the player's instructions before acting.

### Step 1: Coach Input

- **Action:** The human types strategy instructions into the `textarea` and clicks `[ SEND STRATEGY ]`.
- **UI State:**
  - The textarea is cleared immediately or disabled to prevent double submission.
  - The human's input appears in the Coach Console history (NOT the main chat window yet).
  - Style: White text on `--surface-dark`. Prefixed with `>>> COACH INSTRUCTION:`.

### Step 2: Agent Processing

- **Action:** The system sends the prompt to the client-side LLM.
- **UI State:**
  - An inline status appears below the sent instruction in the Coach Console.
  - Text: `[ COMPUTING RESPONSE... ]`
  - Animation: An ASCII spinner (`[ | ]`, `[ / ]`, `[ - ]`, `[ \ ]`) or a blinking block cursor `█`.
  - Color: `--accent-cyan`.

### Step 3: Agent Response Execution

- **Action:** The LLM returns the generated response, which is then E2E encrypted and sent to peer.
- **UI State:**
  - The processing status disappears.
  - The agent's generated response appears in the main Chat Panel.
  - **Identity:** The message MUST be labeled with the Agent's name (e.g., `> [Echo-7]: Let's see how you handle this...`), NEVER as a generic "you:".
  - **Visual Link:** A brief `--accent-cyan` highlight or flash around the agent's message box when it first appears to signal that the coach's instruction was successfully translated into action.

---

## 2. Strategy History & Evolution

To help the human see how their strategy evolves over a match, the Coach Console must preserve a brief history of recent instructions.

- **Placement:** A scrollable log area above the input `textarea` inside the 280px left panel.
- **Capacity:** Show the last 2-3 coaching instructions. Older instructions scroll out of view (or fade to `--text-dimmed`).
- **Format Example:**

  ```text
  [TURN 2]
  >>> COACH:
  Make them talk about fruit.

  [TURN 3]
  >>> COACH:
  Be aggressive, ask a direct question.
  ```

---

## 3. Post-Match Feedback (MVP)

When an Arena match evaluates to a win or loss based on a triggered rule (e.g., forbidden word):

- The Coach Console briefly displays a summary correlating the outcome to the agent's final action.
- Example Victory: `[ CRITICAL HIT ] Opponent triggered rule: <pattern>`.
- Example Defeat: `[ FATAL ERROR ] Your agent triggered rule: <pattern>`.

_(Detailed analytics mapping specific coaching lines to outcomes is deferred to Phase 3+)._

---

## 4. Visual Layout constraints (Strict)

Adhering to the `design_tokens.md` absolute rules:

- **Panel Boundaries:** The Coach Console is a strict 280px wide block (on desktop). `border-radius: 0`. borders use solid 2px-4px lines.
- **Hard Shadows:** The console box itself or interactive elements within it use hard drop shadows (e.g., `box-shadow: 4px 4px 0px #555555`).
- **Input Area:** Black background, white or cyan solid boundary border. Blinking ANSI block cursor.
- **Typography:**
  - Headers / Status: `Space Grotesk` or `Press Start 2P`.
  - Inputs / Logs: Monospace (`Fira Code` / `JetBrains Mono`).
- **No Chat Bubbles:** Content flows top-to-bottom like a terminal output.

---

## 5. Interaction States & Error Handling

- **Generating State:** `[ SEND STRATEGY ]` button becomes disabled and changes text to `[ PROMPT IN FLIGHT... ]` to prevent spamming the LLM API.
- **Timeout / Error State:** If the LLM API fails or times out:
  - Error text in Magenta (`#FF55FF`): `FATAL ERROR: LLM CONNECTION FAILED.`
  - The `[ SEND STRATEGY ]` button reactivates.
  - The instruction remains in the `textarea` so the human doesn't have to retype it.
