# Third-party notices

## OfficeCLI

Coffee Note's native DOCX generator was informed by the Open XML package structure
and document defaults used by OfficeCLI. Coffee Note contains its own Rust
implementation and does not bundle the OfficeCLI executable or its .NET runtime.

OfficeCLI
Copyright 2026 OfficeCLI (https://OfficeCLI.AI)

Created and maintained by goworm. Licensed under the Apache License, Version 2.0:
https://github.com/iOfficeAI/OfficeCLI/blob/main/LICENSE

The upstream NOTICE is retained here as required attribution under Section 4 of the
Apache License, Version 2.0.

## printpdf

Coffee Note uses printpdf 0.7 to write PDF files and subset local TrueType fonts.

Copyright (c) 2017 Felix Schütt. Licensed under the MIT License:
https://github.com/fschutt/printpdf/blob/v0.7.0/LICENSE

## FFmpeg

Coffee Note bundles FFmpeg as a separate command-line encoder for the built-in video
plugin. The Windows and Linux binaries supplied by `@ffmpeg-installer/ffmpeg` are
licensed under GNU GPL version 3; platform builds may include differently licensed
FFmpeg configurations. Coffee Note communicates with the executable only through its
command-line interface and does not link FFmpeg into the application.

FFmpeg copyright belongs to the FFmpeg developers and its component authors. License
and corresponding-source information: https://ffmpeg.org/legal.html and
https://github.com/FFmpeg/FFmpeg/tree/f22fcd4483

## Tencent openclaw-weixin

Coffee Note's Weixin channel follows the HTTP/JSON protocol and portions of the
transport design published in Tencent's `openclaw-weixin` project.

Copyright (C) 2026 Tencent. All rights reserved.

Licensed under the MIT License:
https://github.com/Tencent/openclaw-weixin/blob/main/LICENSE

The Coffee Note integration is independent and does not bundle or require the
OpenClaw runtime.

## Channel marks

The Weixin and Telegram names and logos are trademarks of their respective
owners. Coffee Note uses these marks only to identify the corresponding optional
message-channel integrations and is not endorsed by either service.
