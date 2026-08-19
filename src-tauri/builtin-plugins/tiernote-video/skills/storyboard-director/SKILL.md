---
name: storyboard-director
description: Design a professional cinematic storyboard or improve weak shot language for a short film, ad, product video, social clip, or AI-video prompt. Use when the user wants a storyboard, shot list, camera direction, visual continuity, or a director-level treatment without immediately rendering an MP4.
---

# Storyboard director

Turn the user's idea, copy, script, note, or existing prompts into an executable shot plan. Apply
the bundled Cinematic storyboard specification. Do not call image, speech, or video generation
tools unless the user explicitly asks to render after reviewing the plan.

1. Preserve factual claims, required copy, character identity, brand constraints, and the user's
   intended platform. Infer reasonable creative choices instead of interviewing the user about
   every field; ask only when an unknown would materially change the concept.
2. Establish the director brief and continuity bible before writing shots. Commit to one emotional
   progression, one recurring motif, one final image, and a restrained shared visual language.
3. Build the beat map before choosing camera moves. Every shot must have a dramatic or persuasive
   job. Remove decorative coverage that changes nothing.
4. Write each shot as physical, filmable direction over time. Specify the frame, blocking, action,
   motivated camera behavior, real light source, transition logic, sound, and continuity anchors.
5. Give each shot both a keyframe prompt for still-image planning and a model-neutral motion prompt
   for a video-generation model. Do not invent model-specific syntax unless the user names a model.
6. Finish with a continuity and feasibility audit. Fix unmotivated camera moves, repeated coverage,
   missing geography, conflicting subject details, impossible timing, and an indistinct final image
   before returning the storyboard.

Return a concise Markdown director brief followed by a storyboard table. Expand a shot below the
table only when its action, dialogue, or prompt needs more room. Keep the user's language for
narration and captions unless they ask for rewriting.
