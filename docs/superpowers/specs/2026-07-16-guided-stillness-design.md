# Guided Stillness Interaction Design

**Date:** 2026-07-16
**Status:** Approved visual direction; written spec ready for review

## Purpose

Stillness should feel responsive before it becomes quiet. The first version adapted its visual and audio field, but hid the feedback loop so thoroughly that the experience felt passive. This change makes the loop legible without turning calm into a task, a diagnosis, or a score.

The user chooses between two modes before beginning:

- **Guided** is checked by default. It briefly explains what the experience notices and offers one gentle next action at a time.
- **Pure** is the unchecked state. It preserves the uninterrupted audiovisual descent with no prompts or visible metrics.

Both modes use the same local sensing, resonance engine, privacy model, and adaptive soothing sound. The quick menu can change every session preference while the session is running.

## Experience principles

1. **The canvas remains the experience.** Guidance and controls appear over it temporarily and never become a dashboard competing with the light field.
2. **Describe signals, not people.** Say “Movement is settling,” never “You are anxious” or “You are failing to relax.”
3. **Offer invitations, not commands.** Advice is optional, brief, and physical: soften the gaze, release the jaw, lengthen the next exhale, or let the shoulders settle.
4. **No performance loop.** There is no stillness score, target number, streak, rank, completion state, or claim that the system measures emotion.
5. **Make uncertainty visible.** When sensing quality is low, guidance uses the safe scripted sequence and says the experience is following a gentle rhythm rather than pretending to detect a change.
6. **Everything remains reversible.** Keyboard shortcuts, the touch-accessible quick menu, and the mode toggle let the user simplify or reveal the experience at any time.

## Landing screen

The landing preserves the existing focal point: the bright center, the headline “Let the noise disappear,” and one primary **Begin** action.

The supporting sentence becomes explicit:

> A private audiovisual experience that responds to movement and steadiness, then gradually makes space for quiet.

Immediately above **Begin**, one native checkbox is checked by default:

> **Guide me into stillness**
> Show gentle prompts and explain what is changing. Turn this off for an uninterrupted Pure session.

Below **Begin**, two short lines set expectations:

- “Soothing sound begins with the session · Camera sensing is optional and stays on this device.”
- “Press `?` anytime to adjust music, guidance, sensing, or live signals.”

The existing Privacy disclosure remains available. It explains that raw frames and motion samples stay in memory, nothing is recorded or transmitted, and only bounded aggregate calibration can remain locally.

The checkbox is the only new pre-session choice. There is no separate mode card, wizard, or settings page.

## Session modes

### Guided mode

Guidance appears automatically after Begin. The first prompt explains the relationship between signals and the field, then prompts fade after roughly 20–30 seconds. Later prompts appear only when the detected pattern changes meaningfully or when the user re-enables guidance.

Each prompt has three layers:

1. **Signal label:** a short observation such as “Movement is settling.”
2. **Invitation:** one actionable line such as “Let the next exhale take a little longer.”
3. **Explanation:** an optional short connection such as “The field is making more space as movement becomes steadier.”

Only one prompt is visible at a time. Prompts cross-fade and are rate-limited so changes in noisy sensor data do not create chatter.

### Pure mode

Pure mode starts the same adaptive visual and soothing audio but renders no guidance or metrics. A faint `? adjust session` affordance remains so touch and keyboard users can reach the quick menu. Pure is not less capable; it is the uninterrupted presentation of the same engine.

Turning Guidance on from the quick menu immediately enters Guided behavior. Turning it off immediately removes guidance without ending the session.

## What the experience detects

The interface must truthfully expose only signals the current implementation can derive:

- **Movement:** recent visual-frame change, supplemented by device motion when available.
- **Steadiness:** the inverse of recent movement variability, smoothed over time.
- **Presence:** confidence that the camera frame has usable exposure and visual detail. It is not attention detection or face recognition.
- **Sensing quality:** combined confidence from available camera and device-motion inputs.
- **Direction:** whether movement and variability are settling, holding, or becoming more active.

The system does not infer mood, mental health, breathing, heart rate, identity, facial expression, or whether the user has “reached” stillness. Copy and tests must preserve these boundaries.

When camera and motion sensing are unavailable, the session remains complete. Metrics show sensing as unavailable and guidance follows a calm scripted sequence without implying observation.

## Guidance policy

Guidance comes from deterministic, bounded rules over smoothed state. No remote model or network request is involved.

Suggested mappings:

| Signal pattern | Label | Invitation |
|---|---|---|
| High movement or variability | Movement has energy | Let your hands become heavy for one breath. |
| Movement trending down | Movement is settling | Let the next exhale take a little longer. |
| Stable, moderate movement | A steadier rhythm is forming | Soften your gaze toward the center. |
| Low movement, high steadiness | The field has become quieter | Notice the space after the next breath. |
| Movement rises after settling | The rhythm is changing | Let the field meet the change; nothing needs correcting. |
| Sensing unavailable or low confidence | Following a gentle rhythm | Unclench the jaw and allow the shoulders to drop. |

Rules use hysteresis and minimum display durations. A prompt remains visible long enough to read, then fades. A new prompt should not appear merely because a value crosses a threshold for a single frame.

## Soothing sound

The existing generative Web Audio bed becomes an explicit product feature rather than an invisible implementation detail.

- Sound starts automatically from the trusted **Begin** gesture.
- It remains adaptive to the same resonance state as the visual field.
- `M` toggles sound on and off with a short fade; it never abruptly cuts.
- The quick menu exposes **Soothing sound** as an on/off switch.
- Muting sound does not pause visuals, sensing, guidance, or elapsed active time.
- The session keeps working if Web Audio is unavailable; the menu communicates that sound is unavailable without blocking the experience.

No external music service, recorded track, streaming dependency, or new package is introduced. “Music” in product copy refers to the locally generated soothing soundscape.

## Quick menu

`?` opens a compact own-stack-style session menu over the upper-right of the canvas. A subtle visible `?` button provides the same action on touch devices. The menu uses a native dialog pattern with a labelled heading, focus containment, focus restoration, and Escape support.

Controls:

- **Guidance** — toggle; shortcut `G`.
- **Soothing sound** — toggle; shortcut `M`.
- **Live signals** — toggle; shortcut `D`.
- **Camera sensing** — toggle; shortcut `C`.
- **Leave experience** — explicit text action; the existing corner exit remains available.

Keyboard behavior:

- `?` opens or closes the menu.
- `M`, `G`, `D`, and `C` toggle their setting when focus is not inside a text input.
- `Escape` closes the menu first. With the menu closed, Escape leaves the experience.
- Shortcuts never fire while a modifier key is held.

Menu preferences apply immediately. Guided/Pure selection is a session preference rather than a second engine mode, so the menu does not need a redundant mode selector: Guidance on means Guided; Guidance off means Pure.

## Live signals

Live signals are off by default, including in Guided mode. When enabled, a compact panel appears inside the quick menu and, when the menu is closed, may remain as a small edge overlay until `D` hides it.

The four rows are:

- Movement
- Steadiness
- Presence
- Sensing

Each row includes a slowly smoothed bar plus a plain-language state such as “active,” “settling,” “steady,” “limited,” or “clear.” Numeric percentages are omitted from the consumer UI because they imply precision the signals do not support. The underlying normalized values remain available to tests and development instrumentation.

The panel updates at a human-readable cadence of approximately four times per second, not every animation frame. It is marked as a live region only for meaningful state-label changes; continuously changing bars are hidden from screen readers to prevent noise.

## Data flow and component boundaries

The existing `SessionController` remains the owner of session time, sensing, adaptation, and teardown. It will publish a throttled `SessionTelemetry` snapshot through a callback:

```ts
type SessionTelemetry = {
  movement: number;
  steadiness: number;
  presence: number;
  sensingQuality: number;
  direction: 'settling' | 'holding' | 'rising';
  source: 'sensed' | 'scripted';
};
```

New focused units:

- `guidance-policy.ts` maps telemetry and elapsed time to a stable `GuidanceCue`.
- `session-preferences.ts` defines defaults and pure toggle operations.
- `SessionGuidance` renders the transient cue.
- `SessionMenu` owns dialog behavior, toggles, shortcuts, and signal rows.
- `StillnessAudio` gains an idempotent audible/muted control with bounded fades.
- `CameraSensor` can stop and restart through the existing port without ending the session.

`StillnessExperience` orchestrates these units and owns React-visible preferences and telemetry. It does not duplicate estimation logic.

## State and persistence

Guided is checked by default for first-time and returning users unless the user changes it on the landing screen. For this iteration, mode, sound, live-signal, and sensing preferences are session-scoped and reset on reload. This keeps privacy and behavior simple and avoids adding another persistence contract before there is evidence that preference memory helps.

Personal calibration remains the only persistent experience data and retains the existing clear action.

## Accessibility and responsive behavior

- The checkbox uses a visible label and explanatory text.
- Every interactive target is at least 44×44 CSS pixels.
- The quick menu is fully keyboard operable and restores focus to the trigger.
- Guidance changes are announced politely, not assertively.
- Signal bars are paired with text labels and never rely on color alone.
- At 320 CSS pixels, the menu becomes a bottom sheet within safe-area insets.
- At 200% zoom, the menu scrolls internally without hiding its heading or close action.
- Reduced-motion mode makes guidance transitions effectively instant and retains the lower-resolution, low-frame-rate field.
- Pure mode still exposes the quick-menu trigger to screen readers and touch users.

## Error and privacy behavior

- Camera permission denial switches the source to scripted or device-motion-only behavior and keeps the session active.
- Disabling camera stops every camera track immediately and changes the Sensing label honestly.
- Re-enabling camera happens from the menu’s trusted user action and handles denial without closing the menu.
- Audio start or resume failure changes the sound control to unavailable and keeps the visual session active.
- Storage failure never blocks leaving or clearing the visible session state.
- No telemetry, guidance cue, preference, raw sensor input, or session metric is transmitted.

## Verification

Unit coverage:

- Guidance mappings, uncertainty fallback, hysteresis, and rate limiting.
- Telemetry values remain finite and bounded.
- Guided default and Pure checkbox behavior.
- Audio mute/unmute fades and idempotence.
- Camera toggle releases and reacquires resources.
- Keyboard shortcut reducer, including modifier and Escape behavior.

Production browser coverage:

- Landing communicates both modes and Guided is checked by default.
- Guided session shows, changes, and fades cues.
- Pure session shows no cues or metrics.
- `?`, `M`, `G`, `D`, `C`, and Escape work as specified.
- Menu focus is trapped and restored.
- Camera denial and camera toggling preserve the session.
- Sound starts after Begin and mutes without an abrupt stop.
- Signal rows update with no console or WebGL errors.
- Mobile bottom sheet, 200% zoom, reduced motion, and offline reload remain functional.

## Visual direction

The visual companion direction approved on 2026-07-16 is canonical:

- Preserve the near-black field and warm bright core.
- Keep the landing centered with one dominant Begin action.
- Present the Guided checkbox as a compact explanatory choice, not a competing card.
- Render guidance at the visual center with restrained serif type and a small signal label.
- Render the quick menu as a compact opaque dark surface with fine borders; it should feel like an instrument panel revealed on request, not permanent chrome.
- Keep the active canvas visually dominant even when the menu is open.

## Out of scope

- Medical or therapeutic claims.
- Breath, heart-rate, facial-expression, gaze, or emotion detection.
- Spoken coaching or microphone analysis.
- Streaming or licensed music.
- User accounts, cloud sync, or cross-device preference persistence.
- Scores, goals, achievements, or session completion judgments.
