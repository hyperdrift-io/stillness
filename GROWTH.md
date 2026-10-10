---
app: stillness
url: https://stillness.hyperdrift.io
growth_stage: discovery
primary_channel: seo
posthog:
  region: eu
  north_star: session_ended
  primary_funnel:
    - $pageview
    - session_started
    - session_ended
web_review:
  key_pages:
    - name: Breathing experience and research
      url: /
      funnel_step: session_started
---

# Stillness discovery

The intended outcome is a useful breathing experience that people choose to share. The app is exploratory; use is not evidence of physiological or clinical benefit.

PostHog uses the existing Hyperdrift EU project 206943 because the organization has reached its six-project allowance. All app events carry `app: stillness`; infra declares `posthog_event_app: stillness` so fleet reports filter the shared project. Never interpret the entire shared project as Stillness traffic.

Product events: `$pageview`, `session_started`, `session_ended`, `stage_reached`, `session_preference_changed`, `shared`, `research_opened`. No camera frames, breath/pulse/tension/movement values or felt-state answers leave the device. Replay and autocapture are disabled; browser identity lives in memory. A reload starts a new anonymous identity, so unique-user and retention counts are not reliable person counts. Use session activity and attributed visits for the first discovery read.

`session_ended` includes early exits; it is usage, not completion or relief. Read `elapsed_seconds` and stage before characterizing an experience. Shared means the browser share action/copy result, not a published post or a referred visit. Measure incoming `utm_source=stillness-share` visits separately.

## Evidence to act on

First verify fresh production events and their payload boundary. Then distinguish search/article/homepage referrals, starts, session use and subsequent share-link visits. A source that brings visits but no starts prompts a landing-path review. Repeated sessions with a reproducible rendering failure prompt a fix. No visits means exposure is unproven, not that the app failed. Any efficacy or sensor-accuracy claim requires a separate, consented validation protocol and suitable comparison; product analytics cannot supply it.

## Owned discovery surfaces

- Visible Stillness and GreenLife links on Hyperdrift's homepage.
- Original article: `/blog/a-mirror-that-never-shows-your-face`.
- Primary sources and limitations on Stillness's `#research` disclosure.
- Research series held for founder review in the Hyperdrift editorial workspace; it is not public until approved and deployed.
- Social sharing through the existing in-app share action and 1200 × 630 OG card.
