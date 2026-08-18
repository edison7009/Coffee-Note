# Cinematic storyboard specification

Use this specification for both storyboard-only requests and rendered Coffee Video projects. It is
model-neutral: direct what happens on screen before adapting syntax to a particular generator.

## Director brief

Commit to these decisions before writing shots:

- **Purpose and viewer:** what the piece must make the intended viewer feel, understand, or do.
- **Core change:** the visible difference between the opening state and the final state. For a
  character, identify the immediate desire and obstacle. For a product, identify the friction and
  visible proof of the promise.
- **Emotional progression:** one short arc such as curiosity → pressure → relief. Do not assign a
  different mood adjective to every shot.
- **Motif and final image:** one recurring object, sound, gesture, color, or shape; then a precise
  final composition that resolves or transforms it.
- **Continuity bible:** stable subject traits, wardrobe/product details, location geometry, screen
  direction, palette, motivated light sources, lens character, texture, and motion discipline.
- **Delivery:** duration, aspect ratio, platform, narration/dialogue language, required caption or
  call to action, and whether the result is a plan or should be rendered now.

Do not stall on optional details. Infer a coherent choice and state it briefly when the request is
open-ended.

## Beat before coverage

Choose beats according to the content, not a mechanical shot count:

- **5–15 seconds:** hook already in motion → change or reveal → payoff/final image.
- **15–30 seconds:** hook → pressure/build → turn → payoff → brief afterimage or CTA.
- **30–90 seconds:** hook → context → pressure → crack/reversal → acceleration → impact → aftermath
  or CTA. Compress beats proportionally; do not fill time with establishing shots.

Every shot must do at least one job: change emotion, advance physical action, reveal information,
increase pressure, or prove a product benefit. Delete a shot that does none. Prefer a small number
of distinct, memorable shots to many generic angles.

## Camera grammar

Movement is a response to change, not decoration. Use one dominant move per shot.

| Choice | Use when |
| --- | --- |
| Locked frame | The viewer should observe tension, geometry, performance, or stillness. |
| Slow push-in | A decision, recognition, intimacy, or pressure becomes more important. |
| Pull-back / reveal | Context expands, isolation grows, or hidden scale becomes visible. |
| Tracking move | A subject crosses space and the journey or relationship matters. |
| Pan / tilt | A gaze, gesture, sound, or entering subject motivates a reveal. |
| Orbit | Power or spatial relationships visibly change; never for empty spectacle. |
| Crane / rise | Scale, release, transition, or a new map of the space is the point. |
| Handheld | Instability or immediacy belongs to the story; keep it controlled. |
| Rack focus | Attention transfers between two meaningful depth planes. |
| POV / over-shoulder | Subjectivity, confrontation, or a clear gaze relationship matters. |
| Macro / insert | A recurring object or physical detail changes the scene. |

Name a concrete reason for a move. If nothing changes, keep the camera still. Reserve whip-pans,
crash zooms, drones, Dutch angles, and extreme lens distortion for a specific beat they clarify.

## Shot construction

Each shot card must contain:

1. Shot number, exact time range, duration, and narrative job.
2. Shot size, camera height/angle, lens character, aspect ratio, and one focal point.
3. Composition and blocking: where subject, obstacle/product, look direction, and usable negative
   space sit in the frame. Keep screen direction and the action axis readable across cuts.
4. A start → change → end action timeline made of visible physical behavior. Translate emotion into
   posture, gaze, hands, breath, distance, or interaction with an object.
5. Camera choice and the event that motivates it.
6. Environment and named light sources. Use the environment as pressure, not wallpaper.
7. Entry and exit continuity: match action, gaze, shape, sound, direction, or deliberate contrast.
8. Sound anchor, dialogue or narration, and a short caption when needed. Do not ask a visual model
   to render important text; add captions in composition or post-production.
9. A **keyframe prompt** describing the decisive still frame for image generation.
10. A **motion prompt** describing the same anchored subject and space, the temporal action, camera
    motivation, sound, duration, and aspect ratio for video generation.

The storyboard table should normally use these columns:

`# / time | job | frame & blocking | action | camera & reason | light / sound | transition`

## Prompt discipline

Write prompts from observable facts. Prefer a real light source, a physical micro-action, a spatial
relationship, and a recurring sensory detail over adjective piles such as “cinematic,” “epic,”
“stunning,” “dynamic camera,” or “professional quality.” Technical quality words do not replace
direction.

Keep identity and continuity anchors verbatim across prompts. Describe only changes in action,
framing, or state. A motion prompt should explain what exists at the start, what changes, and the
exact end state. Avoid multiple competing camera moves, impossible choreography, unexplained style
changes, and excessive cuts inside a short model clip.

For the native Coffee Video fallback, the keyframe prompt must stand on its own as a strong still,
and the planned movement must map to `zoom-in`, `zoom-out`, `pan-left`, `pan-right`, or `still`.
For a video model, keep the full temporal motion prompt and adapt provider syntax only after the
model is known.

## Final audit

Before returning or rendering, verify:

- the opening creates immediate visual interest and the final image is specific;
- every shot has a job, one focal point, and a renderable physical change;
- every camera move has a stated reason, with static coverage used when stronger;
- geography, eye trace, screen direction, character/product traits, light, and palette remain clear;
- shot durations add up, dialogue fits, and the action is feasible in the allotted seconds;
- prompts share continuity anchors but do not repeat generic filler;
- the edit has contrast and breathing room instead of constant acceleration.

## Influences

This original Coffee Note specification was informed by the production-planning patterns in
[visual-skills](https://github.com/smixs/visual-skills) by Serge Shima (CC BY 4.0),
[AI Video Storyboard Generator](https://github.com/aicontentskills/ai-video-storyboard-skill)
(MIT), [Kling 3 Prompting Skill](https://github.com/aedev-tools/kling-3-prompting-skill)
(Apache-2.0), and [Higgsfield AI Prompt Skill](https://github.com/OSideMedia/higgsfield-ai-prompt-skill)
(MIT). Coffee Note's wording, model-neutral schema, dual keyframe/motion prompts, and native-runtime
mapping are its own adaptation.
