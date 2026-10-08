# Breathe with the light — design decision

**Date:** 2026-10-08
**Status:** approved direction (founder brief: "the current implementation doesn't achieve its mission in its form; research audio-visual therapy and light/sound induced calming; a unique fix that uses the best of tech to provide a much-needed break, an SOS therapy where users can fully immerse themselves")
**Research:** `../../../../.research/stillness-sos.md` (workspace `.research/`)

## What was wrong

The previous build observed the person well and led them badly. The camera read face, shoulders and movement into a weighted "progress", and progress picked a scene. But nothing on screen gave the body one slow rhythm to fall into: the field drifted, colour cycled through the spectrum every ten seconds, sound was off in production (the album stream only existed on a developer's machine) and the first seconds were a black screen. A stressed person opening it had nothing to do and nothing to follow.

## The one idea

**The whole screen breathes, and the body follows.** One warm light fills with the lungs and empties with the exhale. An ocean rises and falls with it. The person arrives as a storm of lines (their own face as a constellation) and leaves as light. There is nothing to choose and nothing to score.

## Why this works (short form; sources in the research brief)

1. **Slow paced breathing near 6 per minute with a longer exhale** is the best-supported way to lower arousal inside one session (HRV biofeedback meta-analyses; resonance-frequency breathing).
2. **Cyclic sighing** (two inhales, one long exhale) produced the fastest and largest mood and respiratory-rate improvement of the breathing patterns tested against mindfulness (Balban et al., 2023, Cell Reports Medicine). The session opens with five of them.
3. **Visual pacers plus matched audio** are what people actually follow; "match then lead" (start near the person's pace, glide slower) beats a fixed metronome for comfort.
4. **Light safety:** the pacer cycles every five to eleven seconds, two orders of magnitude below the 3 Hz flicker threshold (WCAG 2.3.1). Beat-reactive zoom and bloom were removed; nothing on screen changes faster than the breath.
5. **Dim, warm, low-contrast light and slow, low, predictable sound** reduce arousal; bright or blue light and sudden onsets raise it.

## The arc

| Stage | What the light does | Breath pattern | Gate to the next stage |
|---|---|---|---|
| Arrive | one plain breath at 10/min, cue words teach the mapping | in 3 s / out 3 s | one cycle |
| Sigh | two steps up, one long release | in 1.7 s, again 1.1 s, out 6.4 s, rest 0.6 s | five cycles |
| Slow | glides from 7.5 to 5.5 breaths/min, exhale lengthens to 4:6 | paced | at least eight cycles, at resonance, and the sensed breath follows for three cycles (or fourteen cycles without sensing) |
| Still | rate holds at 5.5, light amplitude thins, constellation dissolves, sound fades | paced | the person leaves when they want to |

The camera never judges. With a trustworthy breath signal it speeds the glide when the person follows; without one the glide keeps a slow floor so a covered camera gets the same reset.

## What the camera is for now

- Breath rate (shoulders and head from on-device landmarks): adapts the glide and reports "your breathing slowed from 15 to 6 a minute" at the end.
- Heart rate by remote photoplethysmography (`src/sensing/pulse-estimator.ts`): the worker averages the skin colour of the forehead and both cheeks each frame; the estimator resamples 16 s of history at 20 Hz, applies the plane-orthogonal-to-skin projection (Wang et al. 2017), and reads the spectral peak between 42 and 240 beats a minute. A signal-to-noise gate (confidence from the peak's share of the band) decides whether a rate exists at all; weak signal means no number, never a guess. Reports "your heart slowed from 84 to 66 a minute". Known limits from the brief: 4–5 bpm error on consumer webcams, worse in dim rooms and on the darkest skin tones, so it is proof of a trend, not a diagnosis.
- Movement energy and facial tension (brow down, squint, jaw press): shape the field's texture and warmth live, and report "movement settled" / "brow softened" at the end, only when the signal was trustworthy.
- Face topology: the constellation in the first stages, which dissolves into the light as stillness arrives.
- Raw frames never leave the device; only bounded aggregates are kept for calibration.

## Colour (added the same evening, founder: "amaze the users through spectacular and captivating colour scheme cycles")

- Each scene owns a cosine spectrum (Quilez palettes): crimson/violet/ember for Turbulence, amber/indigo for Gathering, gold/violet/teal for Coherence, aurora teal/magenta for Release, pearl/cyan/rose for Radiance. The spectrum tints the grammar's light while keeping its luminance.
- The tint turns once every 72 s and sways 5% with each breath, and it varies continuously around and out from the centre, so trails carry several hues at once. No seam: the angular term is a cosine, never the raw angle.
- The breath light moves between a warm pole on the inhale and a cool pole on the exhale; the pair travels from ember/magenta through gold/sky to pearl/aqua with the journey, and which pole the inhale favours drifts slowly with the cycle.
- Safety unchanged: hue moves at 0.014 Hz and 0.1 Hz; luminance stays on the breath's eased ramp; no saturated red (crimson sits at R/(R+G+B) ≈ 0.6).
- Gains after tuning at 60 fps: spectrum 0.95× luminance at 85% mix, chroma 1.4, lifted black 0.02, exposure 0.5 then 0.58, vignette 60% from radius 0.36. The scene grammar's clock runs at 0.22× and the feedback drift at 3% of its former per-frame value, both scaled by frame time, because the one-second feedback memory turns fast-moving patterns into fog.
- **Tune in a real browser at 60 fps, never in the desktop app's browser pane**: the pane runs animation frames at about 1 fps, which keeps every emitted line crisp and the background black, a look no user sees. Headless Chrome through CDP (ANGLE Metal, 60 fps, float buffers) is the reference; Chrome's fake camera device (a moving colour-bar pattern) washes the field out, so capture without it. The founder's real-camera check still stands.

## Session chrome and the quiet close (same evening)

- The `?` trigger is discreet (no border, 42% opacity, bottom left); a share icon sits bottom right (Web Share API, clipboard fallback, `shared` event with its surface).
- Begin asks for full screen; iPhone refuses and stays windowed; leaving the session exits full screen.
- After stillness has fully settled and about 4.5 minutes have passed, a quiet card asks "How do you feel?" with Lighter / About the same / Still tense. "Lighter" offers "Share the light"; every answer offers Done. The light keeps breathing underneath; nobody is thrown out.
- The end panel carries the GreenLife line: Stillness is the minute, GreenLife is the day.

## Sound

Generated locally with Web Audio, on by default, toggled with M:

- ocean: filtered noise, cutoff 170–1090 Hz and gain following lung fullness;
- ground: A2 + E3 + A3 under a 280–520 Hz low-pass, slow detune drift;
- bells: E5 on inhale, F#5 on the second inhale, B4 on exhale, decaying 1.3–3.2 s;
- everything thins by up to 92% in the Still stage.

## Copy

Entry: "Breathe with the light." During: "breathe in", "and again", "let it go" for the first four cycles, then "slower now" and "stay as long as you like" at the two turns. After: plain observations, strengths first, a three-word felt-state tap (Lighter / About the same / Still tense) that feeds PostHog, and "Begin again".

## Removed

Guided/Pure split and the cue policy, the album stream and its server routes, the legacy mirror adapter and unused sensing/visual modules, the spectrum colour cycle, beat-reactive visuals, the 12.5-second calibration gate before the session (calibration now runs behind the first breaths).

## Measurement

PostHog events: `session_started` (sound, camera), `stage_reached` (stage, elapsed), `session_ended` (elapsed, stage, sensed, breath/movement/tension start and end), `felt_state`. The evidence gate for the next iteration is the share of sessions with a sensed breath-rate drop and the felt-state split; no date.

## Next

- Validate the heart-rate estimate against a reference (a watch or a finger oximeter) on a few real sessions and lighting conditions; the unit test proves the algorithm on a synthetic pulse, not the camera path.
- PostHog experiment, one layer at a time (pacer alone, pacer + light, pacer + light + sound), read through the felt-state tap and the sensed deltas.
- Run the PEAT photosensitivity analyser on a recorded session of each visual family before promoting the app to hardening.
