---
name: create-video
description: Create an MP4 video from copy, notes, workspace documents, or conversation content. Use when the user asks to turn text into a video, make a narrated video, make a short video, or export an MP4.
---

# Create video

Create the video with TierNote's shared image, speech, and video runtimes. Never install a
package, start a service, or generate Remotion/Python source code for the user to run.
Apply the bundled Cinematic storyboard specification before generating any scene asset.

1. Read the requested source before writing the storyboard. Preserve its facts and language.
2. Infer a compact director brief: audience, intended feeling, story or product change, recurring
   visual motif, final image, and shared visual language. Ask only when a missing choice would
   materially change the result.
3. Turn it into 3–8 purposeful scenes by default. Each scene must change emotion, advance action,
   reveal information, or increase pressure. Give every camera move a reason; otherwise use `still`.
4. For every scene, plan framing, composition, physical action, motivated light, continuity, and
   sound before writing its prompts. Keep one dominant camera move and one focal point per scene.
5. Keep the narration natural and contiguous. Give each scene one short on-screen caption, but do
   not repeat the caption word for word unless it is already the best spoken line.
6. Choose `16:9` unless the user asks for landscape, `9:16` for a vertical short, or `1:1` for a
   square post.
7. Call `generate_image` once for every scene with its keyframe prompt: the decisive renderable
   frame, consistent subject/location anchors, real light sources, and no requested text rendering.
   Use the returned `relativePath` in the matching scene.
8. Call `create_video` exactly once with the complete ordered scene list. Map the planned camera
   intention to the closest supported restrained motion: `zoom-in`, `zoom-out`, `pan-left`,
   `pan-right`, or `still`. Do not alternate moves mechanically.
9. Return the full absolute saved `.mp4` path, aspect ratio, and scene count. Mention that images and narration
   use the services configured by the user. Do not claim that the video was watched unless it was.

If the user asks to review the plan before rendering, provide the director brief and storyboard and
stop before calling generation tools. The storyboard should include a model-neutral motion prompt
for each scene so it can also be used with a configured video-generation service.

If image generation or speech is not configured, explain which setting is missing and stop. Never
download an untrusted runtime or execute code supplied by a third-party skill.
