# QDiary

A cozy pixel-art diary that runs in your browser. Write, doodle, and stick photos and voice notes onto notebook pages.

## Run it

Double-click `QDiary.cmd`, or run:

```bash
npm start
```

That starts a small local server and opens http://localhost:5178. It needs Node.js and has no dependencies.
Once it's open, Chrome or Edge can install it as an app: open the browser menu and choose **Install QDiary**. After that it also works offline.

Everything is stored privately in your browser with IndexedDB on this device. You can export or import from **Settings → Export & import**.

**On iPad:** QDiary is a static site, so the smoothest way is to put this folder on any HTTPS static host (Vercel — `vercel.json` is included — GitHub Pages, Netlify, Cloudflare Pages), open it in Safari, then tap Share → **Add to Home Screen** to run it full-screen like an app. For a quick test on the same Wi-Fi, run `npm run lan` and open the printed address. Over plain `http://` on another device, Safari blocks the microphone and offline mode, so voice recording needs HTTPS. Each device keeps its own diary; move it between devices with the .zip export/import.

## Features

- **A book, one day per spread**: each day has a left and a right page with spiral rings down the middle. The left page has a date stamp, title, mood, weather and category; the right page is for more writing. Each page can have its own paper: lined, grid, dot grid, blank, pixel grid, gingham, sakura, mint graph, legal pad, kraft, starry night or chalkboard.
- **Turn pages by the corner**: drag the top-right or bottom-right corner to curl the page over to the next day, or a left-page corner to go back to yesterday. A tap on a corner, the arrow buttons, or Alt+← / Alt+→ turn the page too.
- **Fits the screen**: two pages in landscape, one page in portrait (phones and iPad held upright), with zoom controls in the status bar.
- **GoodNotes-style workspace**: one slim toolbar (date and page turning on the left, tools in the middle with each pen's color shown under it, undo/redo on the right). A floating palette under the toolbar shows colors and three sizes for the current tool; text formatting appears only while you type. One **+** button adds a photo, voice note, sticker, washi tape, sticky note or paper. Hide the toolbar (**\** or the ⌃ button) for a clean page with a tiny floating dock.
- **Pinch to zoom**: two fingers zoom around the spot you pinch, and you can pan while you do it. During the gesture the page only moves on the GPU, so it stays smooth. A trackpad pinch or Ctrl + scroll works on a computer. A two-finger tap undoes the last stroke and a three-finger tap redoes it.
- **Scribble to erase**: scratch quickly back and forth over ink with the pen or marker to delete it, with no need to switch to the eraser. A little pixel "poof" shows what happened, and the toast has an Undo button. It can be turned off in Settings.
- **Lasso**: circle ink, stickers or photos to select them, then drag the selection anywhere, even onto the other page. You can also duplicate or delete it, and undo restores ink and items together.
- **Pencil-first on iPad**: the pencil draws in any tool, while fingers scroll, pinch-zoom, move things and drag lasso selections. The sidebar starts folded on iPad, and can be folded away on any screen with the « button.
- **Lively, not busy**: small hops on tool changes, a swaying ribbon, a page corner that peeks to show it can be turned, and cascading cards. Everything stays still if the system's reduce-motion setting is on.
- **Export PDF**: one day, a month, a date range or everything, either as two-page spreads or one page per sheet, at the diary's real page size (Ctrl+P on a page).
- **iPad & Apple Pencil**: the pencil writes with pressure in any tool, even while typing. Once a pencil is used, fingers only scroll and move things, so your palm can rest on the page. Optional Scribble mode turns handwriting into typed text. Touch targets are larger on touch screens.
- **Type**: handwriting-style fonts sit on the paper lines. You get bold, italic, underline, strikethrough, text color, highlight, bullet lists, checkboxes and time stamps.
- **Draw**: pen (pressure-sensitive with a stylus), marker, highlighter, an 8-bit pixel brush and an eraser. Undo and redo work for drawings.
- **Photos**: added as polaroids that you can drag, rotate and resize, each with a caption. Add them with the photo button, by pasting from the clipboard, or by dragging image files onto the page.
- **Voice notes**: record from your microphone, or import or drop in an audio file. Each one becomes a voice polaroid with a waveform, a play/pause button and click-to-seek.
- **Decorations**: sticky notes, 12 pixel stickers and washi tape.
- **Calendar**: a month grid with moods, photo thumbnails and category dots. It also shows your day streak and monthly stats.
- **Entries**: search across every day by title, text or caption, filter by category, and export what you see to Excel.
- **Export & import**:
  - **.zip (everything)**: the spreadsheet, every photo, voice note and drawing as files, one Markdown file per day, and a backup that QDiary can restore completely.
  - **.xlsx**: Entries, Photos, Voice notes and Categories sheets. Edit it in Excel, Google Sheets or Numbers and import it back.
  - **.csv**: the Entries table only.
  - **.json**: everything in one file.
  - Import accepts .zip, .json, .xlsx and .csv, and shows a summary before it changes anything.
- **Photos & Voice notes library**: every photo and recording in one place. Each card shows which page it's from, the page date and when it was added. Click a card to jump to that page with the item highlighted.
- **Categories**: add, rename, recolor and delete them.
- **Settings**: 8 themes (2 dark), a custom accent color, auto night mode, pixel or soft UI style, desk pattern, 12 writing fonts, text size, interface font, writing language, spellcheck, default paper and category, week start, date and time formats, and 8-bit sound effects.
- **Multilingual**: type in any language with your OS keyboard. Thai, Japanese, Korean, Chinese, Arabic and others have font coverage. Text direction is detected per paragraph. Word counts also work for languages written without spaces.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| T / P / M / H / X / E / L | Type, pen, marker, highlighter, pixel brush, eraser, lasso |
| [ and ] | Brush size |
| Ctrl+Z / Ctrl+Y | Undo / redo drawing |
| Delete | Remove the selected item |
| Shift while rotating | Snap rotation to 15° |
| Drag or tap a page corner | Next day (right corners) / previous day (left corners) |
| Alt+← / Alt+→, PageUp / PageDown | Turn back / forward |
| Pinch / two-finger tap / three-finger tap | Zoom / undo / redo |
| Ctrl + = / - / 0 | Zoom in / out / fit |
| \ | Hide or show the toolbar |
| Ctrl+P | Export PDF |
| Ctrl+S | Save now |
| Esc | Deselect / back to typing |

## Files

| Path | What it is |
| --- | --- |
| `index.html` | App shell |
| `css/app.css` | All styles: pixel boxes, notebook, papers, polaroids, views |
| `js/util.js` | DOM helpers, dates, popovers, modals, toasts, 8-bit sound effects |
| `js/icons.js` | Pixel icons and stickers drawn from text bitmaps |
| `js/store.js` | IndexedDB storage, autosave, backup export and import |
| `js/theme.js` | Themes, fonts, papers, applying settings |
| `js/media.js` | Photo processing, voice recorder, Web Audio player |
| `js/journal.js` | The two-page book: editor, drawing, Pencil handling, page-curl turning, mini calendar |
| `js/pdf.js` | Export PDF: print-ready diary pages |
| `js/transfer.js` | Export/import: ZIP and XLSX writers/readers, CSV, Markdown |
| `js/views.js` | Calendar, Entries, Photos and Voice notes library |
| `js/settings.js` | Settings page |
| `js/app.js` | Sidebar, routing, startup |
| `server.js` | Tiny static server |
