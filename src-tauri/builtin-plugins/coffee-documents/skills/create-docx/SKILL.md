---
name: create-docx
description: Create an editable Word DOCX document from selected notes, workspace documents, research, outlines, or conversation content. Use when the user asks for a Word document, DOCX, editable report, brief, proposal, handbook, or formatted document.
---

# Create DOCX

Create the document with Coffee Note's shared document runtime. Never install a package,
start a separate service, generate source code for the user to run, or invoke Microsoft Office.

1. Read the selected note and any requested workspace sources before drafting.
2. Infer the audience, purpose, language, and suitable depth. Make reasonable formatting defaults
   when the user does not specify them.
3. Rewrite the material into a coherent document rather than copying raw Markdown structure.
   Preserve important facts, names, dates, qualifications, and source wording where precision matters.
4. Use a concise title, optional subtitle and author, semantic headings, readable paragraphs,
   bullet lists only where scanning helps, and quotes only for actual quotations or callouts.
5. Use `page-break` sparingly for a major new section that should start on a fresh page.
6. Call `create_document` exactly once with `format` set to `docx` and the complete ordered
   `blocks` array. Never request PDF from this skill.
7. Return the saved `.docx` path and block count. Say that it is editable, but do not claim it
   was visually inspected unless a rendered preview was actually checked.
