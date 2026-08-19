---
name: media-to-text
description: Transcribe public audio or video links and local media files, clean the transcript, and save it as an editable note. Use when the user provides a supported media URL or an audio/video file and asks to extract speech, create a transcript, or turn the recording into a readable note.
---

# Media to text

Use TierNote's shared media runtime. Never install a downloader, speech engine, or model from this skill.

1. Extract one public media URL or absolute local media path from the request.
2. Call `transcribe_media` with that source and the configured recognition mode.
3. Stop without writing a file if transcription fails or returns no usable text.
4. Clean obvious recognition errors and spoken-language fragments without adding facts or opinions.
5. Call `save_note` without `path` so the result becomes a new note in the workspace root. Never reuse or overwrite an older note merely because it has the same source.
6. Return only the cleaned body text. Do not mention the runtime, model, API, source URL, file path, recognition errors, or completion status. Do not add a title, bullets, summary, or technical notes unless the user explicitly asks for them.
