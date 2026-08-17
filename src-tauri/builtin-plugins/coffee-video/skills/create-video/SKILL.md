---
name: create-video
description: Create an MP4 video from copy, notes, workspace documents, or conversation content. Use when the user asks to turn text into a video, make a narrated video, make a short video, or export an MP4.
---

# Create video

Create the video with Coffee Note's shared image, speech, and video runtimes. Never install a
package, start a service, or generate Remotion/Python source code for the user to run.

1. Read the requested source before writing the storyboard. Preserve its facts and language.
2. Turn it into 3–8 scenes by default. Each scene needs one clear idea, concise spoken narration,
   a short on-screen caption, and a visual prompt that does not ask the image model to render text.
3. Keep the narration natural and contiguous. Do not repeat the caption word for word unless it
   is already the best spoken line.
4. Choose `16:9` unless the user asks for landscape, `9:16` for a vertical short, or `1:1` for a
   square post.
5. Call `generate_image` once for every scene, using the video's aspect ratio and a consistent
   visual language. Use the returned `relativePath` in the matching scene.
6. Call `create_video` exactly once with the complete ordered scene list. Choose restrained motion;
   alternate `zoom-in`, `zoom-out`, `pan-left`, and `pan-right` only when it suits the composition.
7. Return the saved `.mp4` path, aspect ratio, and scene count. Mention that images and narration
   use the services configured by the user. Do not claim that the video was watched unless it was.

If image generation or speech is not configured, explain which setting is missing and stop. Never
download an untrusted runtime or execute code supplied by a third-party skill.
