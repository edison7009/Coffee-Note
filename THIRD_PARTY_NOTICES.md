# Third-party notices

## anydoc

TierNote uses anydoc 0.1.9 to convert local Word, PowerPoint, Excel,
OpenDocument, RTF, EPUB, CSV, and text-based PDF files into structured Markdown
for the Agent. Conversion runs locally inside the desktop application; TierNote
does not use the hosted Firecrawl Parse service.

MIT License

Copyright (c) 2026 Sideguide Technologies Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Source and license:
https://github.com/firecrawl/anydoc/blob/v0.1.9/LICENSE

## printpdf

TierNote uses printpdf 0.7 to write PDF files and subset local TrueType fonts.

Copyright (c) 2017 Felix Schütt. Licensed under the MIT License:
https://github.com/fschutt/printpdf/blob/v0.7.0/LICENSE

## FFmpeg

TierNote bundles FFmpeg as a separate command-line encoder for the built-in video
plugin. The Windows and Linux binaries supplied by `@ffmpeg-installer/ffmpeg` are
licensed under GNU GPL version 3; platform builds may include differently licensed
FFmpeg configurations. TierNote communicates with the executable only through its
command-line interface and does not link FFmpeg into the application.

FFmpeg copyright belongs to the FFmpeg developers and its component authors. License
and corresponding-source information: https://ffmpeg.org/legal.html and
https://github.com/FFmpeg/FFmpeg/tree/f22fcd4483

## Tencent openclaw-weixin

TierNote's Weixin channel follows the HTTP/JSON protocol and portions of the
transport design published in Tencent's `openclaw-weixin` project.

Copyright (C) 2026 Tencent. All rights reserved.

Licensed under the MIT License:
https://github.com/Tencent/openclaw-weixin/blob/main/LICENSE

The TierNote integration is independent and does not bundle or require the
OpenClaw runtime.

## Channel marks

The Weixin and Telegram names and logos are trademarks of their respective
owners. TierNote uses these marks only to identify the corresponding optional
message-channel integrations and is not endorsed by either service.
