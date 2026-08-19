---
name: media-to-text
description: Transcribe public audio or video links and local media files, turn the transcript into natural readable prose, give it a concise navigation-friendly title, and save it as an editable note. Use when the user asks to extract speech, create a transcript, or turn a recording into a readable note.
---

# Media to text

Use TierNote's shared media runtime. Never install a downloader, speech engine, or model from this skill.

1. Extract one public media URL or absolute local media path from the request.
2. Call `transcribe_media` with that source and the configured recognition mode.
3. Stop without writing a file if transcription fails or returns no usable text.
4. Edit the transcript into a faithful, comfortable reading experience using the rules below.
5. Derive the title from the edited note, not by copying the media's original headline.
6. Call `save_note` without `path`, passing the concise title and polished Markdown body. For a public URL, also pass that URL in `sources`. The result must be a new note in the workspace root; never reuse or overwrite an older note merely because it has the same source.
7. Return only the polished body text. Do not mention the runtime, model, API, source URL, file path, recognition errors, editing process, or completion status.

## Short-title contract

The `title` passed to `save_note` is the note heading and filename stem, so optimize it for TierNote's narrow left navigation.

- Match the requested language; otherwise use the transcript's dominant language.
- For Chinese, prefer 7–10 visible characters when the meaning can remain accurate. Count Latin letters and digits as visible characters. If a necessary proper name makes that range impossible, use the shortest faithful title rather than cutting the name or inventing an abbreviation.
- For English, prefer 3–6 words and keep the complete title within 40 characters when practical.
- Capture one central subject, result, question, or decision. Prefer a concrete noun phrase or a compact claim.
- Keep essential names, numbers, and time scope only when they distinguish the note. Remove channel names, series labels, decorative prefixes, repeated `AI` labels, and empty framing such as “关于…”, “一次分享”, “视频解读”, “完整解析”, or “值得关注”.
- Do not use clickbait, suspense, praise, conclusions, or certainty that the source does not support. Do not end with punctuation or put the title in quotation marks.
- Never place a duplicate H1 title in `content`; `save_note` adds it.

Shape examples only:

- `AI热榜：本周最值得关注的5个AI项目` → `本周五个AI项目`
- `The Five AI Projects Most Worth Watching This Week` → `Five AI Projects This Week`

## Faithful editorial polish

- Preserve the speaker's meaning, factual qualifiers, uncertainty, attribution, concrete names, numbers, and chronology. Never add a fact, opinion, emotion, example, quotation, transition, or conclusion that is absent from the source.
- Correct an apparent recognition error only when nearby context makes the correction clear. Do not guess names or technical terms. Keep a meaningful uncertain fragment marked briefly as `[听不清]` or `[unclear]`; omit it only when it carries no usable information.
- Remove transcription noise: filler words, stutters, abandoned starts, accidental duplicate lines, caption artifacts, and repeated claims that add nothing.
- Turn fragmented speech into natural written sentences while retaining the source's level of formality and personality. Preserve first-person wording when it belongs to the speaker; do not manufacture a new narrator or inject casual slang.
- Delete generic AI scaffolding such as “值得注意的是”, “综上所述”, “让我们来看看”, “在当今…时代”, empty importance claims, fake `不是 A 而是 B` contrasts, self-answered rhetorical questions, forced metaphors, and repetitive connectors. Direct source language is allowed even when it matches one of these patterns; edit only model-added or clearly redundant framing.
- Organize around the material actually present. Use short paragraphs and descriptive section headings for genuine topic changes. Use bullets or numbering only for real parallel items, rankings, steps, or checklists. Keep speaker labels only when attribution between multiple speakers matters.
- Do not force every note into a fixed “overview / key points / limitations / conclusion” template. Start with the substance, keep sections proportional to their importance, and stop when the source stops.
- Keep the body self-contained and useful. Do not include the source URL, processing notes, an AI-quality report, editing statistics, or a second title in the body.
