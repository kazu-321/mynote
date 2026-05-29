# AGENTS.md

## Project Name

mynote

## Project Overview

mynote is a local-first, Git-managed, freeform canvas note application.

The application allows users to create subject-based notes on an infinite canvas. Users can place text, Markdown, TeX, images, PDF pages rendered as images, freehand strokes, straight lines, geometric shapes, and other visual elements.

The application has two modes:

1. Local edit mode
   - Runs locally.
   - Allows creating, editing, deleting, importing, arranging, and saving notes.
   - Saves note data as JSON files.
   - Saves all image assets under each note directory.
   - Writes directly to the repository through a local Node.js API server.
   - Data is later committed and pushed with Git.

2. GitHub Pages readonly mode
   - Runs as a static site.
   - Allows browsing subjects and notes.
   - Allows opening and viewing notes.
   - Allows panning and zooming the canvas.
   - Does not allow editing, saving, creating, deleting, importing, or modifying data.
   - Reads JSON and PNG assets from the static `public/data` directory.

The same frontend codebase must be used for both local edit mode and GitHub Pages readonly mode.

---

## Core Design Goals

- The app must behave like a Figma-style freeform note canvas.
- The canvas must be infinite.
- Notes must be organized by subject.
- Data must be stored as JSON.
- All assets must be separated by note.
- All imported images must be converted to PNG.
- PDF files must be converted to PNG images at import time.
- Original imported files must not be stored.
- The app must support automatic saving.
- Undo and redo are mandatory.
- All canvas elements must support z-index ordering.
- Layer movement operations are required.
- Git is considered the backup and history mechanism.
- The app must be designed for long-term growth.
- Files must be split by responsibility and feature.
- Avoid monolithic files.

---

## Non-Negotiable Requirements

### Data

- Notes are saved as JSON.
- Each note has its own directory.
- Each note directory contains its own metadata, note JSON, and assets.
- Assets must not be shared globally unless explicitly required later.
- Binary data must not be embedded in JSON.
- Images must not be stored as Base64.
- All persistent imported images must be PNG.
- Original PDF files must not be stored.
- Original image files must not be stored.
- PDF import must immediately render pages to PNG and discard the original file.

### IDs and Names

- Internal IDs must be UUIDs.
- Folder names must be UUIDs.
- Subject IDs must be UUIDs.
- Note IDs must be UUIDs.
- Canvas element IDs must be UUIDs.
- User-visible subject names may be Japanese.
- User-visible note titles may be Japanese.
- Do not use Japanese text as internal IDs or folder names.
- Store the mapping between UUIDs and Japanese display names in JSON.

### Editing

- Local edit mode must support editing.
- GitHub Pages mode must be readonly.
- Mobile editing is not required.
- Smartphone usage is readonly viewing only.
- Desktop editing is the main target.
- Mouse and touchpad operation are required.

### Saving

- Autosave is required.
- Manual save may also exist, but autosave must be implemented.
- Git is the backup mechanism.
- Do not implement separate backup directories unless explicitly requested later.
- Save failures must be visible in the UI.

### Canvas

- Infinite canvas is required.
- Canvas elements use world coordinates.
- Negative coordinates are valid.
- The canvas must not depend on a fixed document size.
- All elements must have `zIndex`.
- All elements must support rotation unless explicitly impractical.
- Layer operations are required:
  - Bring to front
  - Send to back
  - Bring forward
  - Send backward

### Undo / Redo

- Undo and redo are mandatory.
- Use a command-based history system.
- Do not implement undo/redo as random snapshots inside React components.
- Editing operations must be reversible.
- Viewport changes do not need to be undoable.

---

## Recommended Tech Stack

Use the following stack unless there is a very strong reason to change it:

- React
- TypeScript
- Vite
- react-konva / Konva
- Node.js local API server
- PDF.js
- KaTeX
- markdown-it
- zod

### Purpose of Each Library

- React:
  - UI composition
  - page structure
  - panels
  - toolbar
  - dialogs
  - home page

- TypeScript:
  - strict data modeling
  - discriminated unions for canvas elements
  - storage interfaces
  - command types

- Vite:
  - development server
  - frontend build
  - GitHub Pages deployment

- react-konva / Konva:
  - canvas rendering
  - draggable elements
  - shapes
  - freehand strokes
  - layers
  - selection overlays
  - transformations

- Node.js local API server:
  - read JSON
  - write JSON
  - create notes
  - delete notes
  - write PNG assets
  - generate thumbnails

- PDF.js:
  - render PDF pages to images at import time

- KaTeX:
  - render TeX

- markdown-it:
  - render Markdown

- zod:
  - runtime validation before saving JSON

---

## Application Modes

The app must support these modes:

```ts
export type AppMode = "local-edit" | "readonly-pages";
```

### Local Edit Mode

Local edit mode may:

- create subjects
- rename subjects
- delete empty subjects
- create notes
- rename notes
- delete notes
- reorder subjects
- reorder notes inside a subject
- edit canvas elements
- import images
- import PDF files
- generate PNG assets
- generate thumbnails
- autosave JSON
- update metadata
- update manifest

Local edit mode must use the local API server for file writes.

### GitHub Pages Readonly Mode

Readonly mode may:

- read manifest
- read subjects
- read note metadata
- read note JSON
- read PNG assets
- display home page
- display notes
- pan canvas
- zoom canvas
- open and close subjects
- open notes

Readonly mode must not:

- create subjects
- rename subjects
- delete subjects
- create notes
- rename notes
- delete notes
- reorder subjects
- reorder notes
- edit canvas elements
- import files
- write JSON
- write assets
- call local API endpoints
- show active editing controls

Readonly mode should clearly indicate that the app is in readonly mode.

---

## Storage Architecture

All data access must go through a storage abstraction.

React components must not directly write files.

React components must not directly call filesystem APIs.

React components must not directly call local API endpoints except through storage/repository layers.

Use this structure:

```ts
export interface StorageAdapter {
  getAppMode(): AppMode;

  loadManifest(): Promise<AppManifest>;
  saveManifest(manifest: AppManifest): Promise<void>;

  loadSubject(subjectId: string): Promise<SubjectData>;
  saveSubject(subject: SubjectData): Promise<void>;

  loadNoteMeta(subjectId: string, noteId: string): Promise<NoteMeta>;
  saveNoteMeta(meta: NoteMeta): Promise<void>;

  loadNote(subjectId: string, noteId: string): Promise<NoteData>;
  saveNote(note: NoteData): Promise<void>;

  createSubject(input: CreateSubjectInput): Promise<SubjectData>;
  deleteSubject(subjectId: string): Promise<void>;

  createNote(input: CreateNoteInput): Promise<NoteData>;
  deleteNote(subjectId: string, noteId: string): Promise<void>;

  writePngAsset(input: WritePngAssetInput): Promise<AssetRef>;
  deleteAsset(input: DeleteAssetInput): Promise<void>;

  generateThumbnail(input: GenerateThumbnailInput): Promise<AssetRef>;
}
```

Implement at least:

```txt
LocalApiStorageAdapter
StaticReadonlyStorageAdapter
```

### LocalApiStorageAdapter

- Used in local edit mode.
- Communicates with the local Node.js API server.
- Can write JSON and PNG assets.
- Can create and delete files.
- Can generate thumbnails.

### StaticReadonlyStorageAdapter

- Used in GitHub Pages readonly mode.
- Uses `fetch` to read static JSON and PNG assets.
- All write methods must throw a clear readonly error.
- Must never call local API endpoints.

---

## Repository Structure

Use this project structure.

```txt
mynote/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── public/
│   └── data/
│       ├── manifest.json
│       ├── subjects/
│       └── notes/
├── scripts/
│   ├── validate-data.ts
│   ├── migrate-data.ts
│   └── check-assets.ts
├── server/
│   ├── index.ts
│   ├── app.ts
│   ├── routes/
│   │   ├── manifestRoutes.ts
│   │   ├── subjectRoutes.ts
│   │   ├── noteRoutes.ts
│   │   └── assetRoutes.ts
│   ├── services/
│   │   ├── fileStore.ts
│   │   ├── subjectStore.ts
│   │   ├── noteStore.ts
│   │   ├── assetStore.ts
│   │   └── thumbnailService.ts
│   └── utils/
│       ├── paths.ts
│       ├── json.ts
│       └── errors.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── app/
    │   ├── appMode.ts
    │   ├── config.ts
    │   ├── router.tsx
    │   └── providers.tsx
    ├── pages/
    │   ├── HomePage/
    │   │   ├── HomePage.tsx
    │   │   ├── HomePage.module.css
    │   │   ├── SubjectSection.tsx
    │   │   ├── NoteCard.tsx
    │   │   └── useHomePage.ts
    │   └── NoteEditorPage/
    │       ├── NoteEditorPage.tsx
    │       ├── NoteEditorPage.module.css
    │       ├── NoteEditorHeader.tsx
    │       └── useNoteEditorPage.ts
    ├── features/
    │   ├── canvas/
    │   │   ├── components/
    │   │   │   ├── CanvasStage.tsx
    │   │   │   ├── CanvasViewport.tsx
    │   │   │   ├── CanvasElementRenderer.tsx
    │   │   │   ├── SelectionBox.tsx
    │   │   │   ├── SelectionOverlay.tsx
    │   │   │   ├── TransformHandles.tsx
    │   │   │   ├── FloatingTextEditor.tsx
    │   │   │   ├── CanvasContextMenu.tsx
    │   │   │   └── GridOverlay.tsx
    │   │   ├── hooks/
    │   │   │   ├── useCanvasViewport.ts
    │   │   │   ├── useCanvasSelection.ts
    │   │   │   ├── useCanvasPointerEvents.ts
    │   │   │   ├── useCanvasKeyboardShortcuts.ts
    │   │   │   ├── useCanvasClipboard.ts
    │   │   │   └── useCanvasAutosave.ts
    │   │   ├── model/
    │   │   │   ├── canvasTypes.ts
    │   │   │   ├── elementTypes.ts
    │   │   │   ├── viewportTypes.ts
    │   │   │   ├── selectionTypes.ts
    │   │   │   └── gridTypes.ts
    │   │   ├── tools/
    │   │   │   ├── toolTypes.ts
    │   │   │   ├── selectTool.ts
    │   │   │   ├── panTool.ts
    │   │   │   ├── penTool.ts
    │   │   │   ├── lineTool.ts
    │   │   │   ├── rectTool.ts
    │   │   │   ├── ellipseTool.ts
    │   │   │   ├── arrowTool.ts
    │   │   │   ├── textTool.ts
    │   │   │   └── imageTool.ts
    │   │   ├── utils/
    │   │   │   ├── coordinates.ts
    │   │   │   ├── geometry.ts
    │   │   │   ├── hitTest.ts
    │   │   │   ├── snapping.ts
    │   │   │   ├── zIndex.ts
    │   │   │   └── transforms.ts
    │   │   └── state/
    │   │       ├── canvasReducer.ts
    │   │       ├── canvasActions.ts
    │   │       └── canvasState.ts
    │   ├── notes/
    │   │   ├── model/
    │   │   │   ├── manifestTypes.ts
    │   │   │   ├── subjectTypes.ts
    │   │   │   ├── noteTypes.ts
    │   │   │   └── noteSchemas.ts
    │   │   ├── services/
    │   │   │   ├── manifestRepository.ts
    │   │   │   ├── subjectRepository.ts
    │   │   │   └── noteRepository.ts
    │   │   └── utils/
    │   │       ├── createSubject.ts
    │   │       ├── createNote.ts
    │   │       └── ordering.ts
    │   ├── importers/
    │   │   ├── imageImporter.ts
    │   │   ├── pdfImporter.ts
    │   │   ├── transparentBackground.ts
    │   │   ├── perspectiveTransform.ts
    │   │   └── fileDropHandler.ts
    │   ├── markdown/
    │   │   ├── markdownParser.ts
    │   │   └── MarkdownRenderer.tsx
    │   ├── tex/
    │   │   ├── texParser.ts
    │   │   └── TexRenderer.tsx
    │   ├── history/
    │   │   ├── commandTypes.ts
    │   │   ├── historyManager.ts
    │   │   └── commands/
    │   │       ├── addElementCommand.ts
    │   │       ├── deleteElementCommand.ts
    │   │       ├── updateElementCommand.ts
    │   │       ├── moveElementCommand.ts
    │   │       ├── resizeElementCommand.ts
    │   │       ├── rotateElementCommand.ts
    │   │       ├── reorderElementCommand.ts
    │   │       ├── importImageCommand.ts
    │   │       └── importPdfPagesCommand.ts
    │   └── shapeRecognition/
    │       ├── shapeRecognitionTypes.ts
    │       ├── recognizeFreehandShape.ts
    │       ├── recognizeLine.ts
    │       ├── recognizeRect.ts
    │       ├── recognizeEllipse.ts
    │       └── convertFreehandToShape.ts
    ├── shared/
    │   ├── components/
    │   │   ├── Button.tsx
    │   │   ├── IconButton.tsx
    │   │   ├── Modal.tsx
    │   │   ├── ConfirmDialog.tsx
    │   │   ├── Dropdown.tsx
    │   │   ├── Toolbar.tsx
    │   │   └── ErrorMessage.tsx
    │   ├── storage/
    │   │   ├── storageAdapter.ts
    │   │   ├── localApiStorageAdapter.ts
    │   │   └── staticReadonlyStorageAdapter.ts
    │   ├── utils/
    │   │   ├── assert.ts
    │   │   ├── id.ts
    │   │   ├── path.ts
    │   │   ├── time.ts
    │   │   └── clamp.ts
    │   └── styles/
    │       ├── globals.css
    │       └── variables.css
    └── types/
        └── global.d.ts
```

---

## Data Directory Rules

All user data lives under:

```txt
public/data/
```

Use this layout:

```txt
public/data/
├── manifest.json
├── subjects/
│   ├── <subjectId>.json
│   └── <subjectId>.json
└── notes/
    └── <subjectId>/
        └── <noteId>/
            ├── meta.json
            ├── note.json
            └── assets/
                ├── images/
                ├── pdf-pages/
                └── thumbnails/
```

Example:

```txt
public/data/
├── manifest.json
├── subjects/
│   └── 8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61.json
└── notes/
    └── 8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61/
        └── 3c460646-6d8d-45eb-90e0-5ad2f928a0c6/
            ├── meta.json
            ├── note.json
            └── assets/
                ├── images/
                │   ├── image_001.png
                │   └── image_002.png
                ├── pdf-pages/
                │   ├── page_001.png
                │   ├── page_002.png
                │   └── page_003.png
                └── thumbnails/
                    └── thumbnail.png
```

Do not create global asset directories for note-specific files.

Do not store original imports.

Do not store PDFs.

Do not store JPG, JPEG, WebP, GIF, BMP, or other image formats as persistent note assets.

All imported images must be converted to PNG before being stored.

---

## JSON Ordering Rules

JSON arrays preserve order.

Use arrays when order matters.

Subject order must be stored in `manifest.json`.

Note order inside a subject must be stored in the corresponding subject JSON.

Element z-order must be determined by each element's `zIndex`.

Do not rely on object key order for meaningful ordering.

Correct:

```json
{
  "subjectOrder": [
    "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61",
    "df9b7a35-447d-4f20-89df-f3d43d03457f"
  ]
}
```

Incorrect:

```json
{
  "subjects": {
    "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61": {},
    "df9b7a35-447d-4f20-89df-f3d43d03457f": {}
  }
}
```

Object maps may be used for lookup, but explicit arrays must be used for order.

---

## Manifest Data Model

`public/data/manifest.json`

```json
{
  "schemaVersion": 1,
  "appName": "mynote",
  "appVersion": "0.1.0",
  "subjectOrder": [
    "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61"
  ],
  "subjects": [
    {
      "id": "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61",
      "name": "数学",
      "path": "subjects/8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61.json"
    }
  ]
}
```

Rules:

- `subjectOrder` controls home page subject ordering.
- `subjects[].id` must be UUID.
- `subjects[].name` may be Japanese.
- `subjects[].path` must point to the subject JSON file.
- The UI must display `name`, not `id`.

---

## Subject Data Model

`public/data/subjects/<subjectId>.json`

```json
{
  "schemaVersion": 1,
  "id": "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61",
  "name": "数学",
  "description": "",
  "createdAt": "2026-05-29T00:00:00.000Z",
  "updatedAt": "2026-05-29T00:00:00.000Z",
  "noteOrder": [
    "3c460646-6d8d-45eb-90e0-5ad2f928a0c6"
  ],
  "notes": [
    {
      "id": "3c460646-6d8d-45eb-90e0-5ad2f928a0c6",
      "title": "微分積分",
      "metaPath": "notes/8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61/3c460646-6d8d-45eb-90e0-5ad2f928a0c6/meta.json",
      "notePath": "notes/8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61/3c460646-6d8d-45eb-90e0-5ad2f928a0c6/note.json"
    }
  ]
}
```

Rules:

- `noteOrder` controls note ordering inside the subject.
- Home page must use this order.
- The user can reorder notes by drag and drop.
- Reordering notes updates `noteOrder`.
- `notes[].title` may be Japanese.
- `notes[].id` must be UUID.
- A subject with existing notes must not be deleted.
- Empty subjects may be deleted in local edit mode.

---

## Note Metadata Model

`public/data/notes/<subjectId>/<noteId>/meta.json`

```json
{
  "schemaVersion": 1,
  "id": "3c460646-6d8d-45eb-90e0-5ad2f928a0c6",
  "subjectId": "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61",
  "title": "微分積分",
  "description": "",
  "createdAt": "2026-05-29T00:00:00.000Z",
  "updatedAt": "2026-05-29T00:00:00.000Z",
  "thumbnail": "assets/thumbnails/thumbnail.png"
}
```

Rules:

- Metadata is used for home page note cards.
- Metadata must be lightweight.
- Do not store full canvas data in `meta.json`.
- `thumbnail` points to the last-viewed viewport thumbnail.
- If no thumbnail exists, the UI must show a fallback card.

---

## Note Data Model

`public/data/notes/<subjectId>/<noteId>/note.json`

```json
{
  "schemaVersion": 1,
  "id": "3c460646-6d8d-45eb-90e0-5ad2f928a0c6",
  "subjectId": "8e3d5d89-0cc0-4cbe-8a24-f17d483e6f61",
  "title": "微分積分",
  "createdAt": "2026-05-29T00:00:00.000Z",
  "updatedAt": "2026-05-29T00:00:00.000Z",
  "canvas": {
    "type": "infinite",
    "viewport": {
      "x": 0,
      "y": 0,
      "scale": 1
    },
    "grid": {
      "mode": "free",
      "snapStep": 10,
      "gridSize": 100,
      "visible": false
    },
    "elements": []
  }
}
```

Rules:

- `canvas.type` must be `"infinite"`.
- `canvas.viewport` stores the last viewed viewport.
- `canvas.grid.mode` must be `"free"` or `"assisted"`.
- `canvas.grid.snapStep` is the smallest movement unit in assisted mode.
- `canvas.grid.gridSize` is usually `snapStep * 10`.
- `canvas.elements` contains all canvas elements.

---

## Canvas Coordinate System

Use two coordinate systems:

1. World coordinates
   - Coordinates of canvas objects.
   - Infinite.
   - Negative coordinates are allowed.
   - Saved in JSON.

2. Screen coordinates
   - Browser viewport coordinates.
   - Used for pointer events and rendering.

Required utility functions:

```ts
export function screenToWorld(
  screenPoint: Point,
  viewport: CanvasViewport
): Point;

export function worldToScreen(
  worldPoint: Point,
  viewport: CanvasViewport
): Point;
```

Do not duplicate coordinate conversion logic throughout the codebase.

All selection, dragging, drawing, hit testing, grid snapping, and placement must use these utilities.

---

## Zoom Rules

The user does not want a restrictive normal zoom range.

Do not use typical limits like `0.1` to `8`.

For system stability only, use an extreme safety range if needed:

```ts
const MIN_SAFE_ZOOM = 0.00001;
const MAX_SAFE_ZOOM = 10000.0;
```

Rules:

- Do not expose these as ordinary UX limits.
- They are only for preventing numerical instability.
- The app should feel effectively unlimited.
- Zoom should preserve the world position under the cursor when using wheel zoom.

---

## Viewport Controls

Required controls:

- Middle mouse drag:
  - pan viewport

- Two-finger trackpad scroll:
  - pan viewport

- Space + left drag:
  - pan viewport

- Ctrl/Cmd + wheel:
  - zoom viewport

- Normal left drag on empty canvas:
  - selection rectangle

- Normal left drag on element:
  - move element

- Right click:
  - show context menu

Rules:

- Right click must not start selection.
- Right click must not move elements.
- Middle click must not select elements.
- Space key temporarily activates pan behavior.
- If space is held, left drag pans even if the pointer is over an element.
- Normal left click on an element selects it.
- Normal left drag on selected element moves it.

---

## Selection Rules

The app must support all of the following:

- Single click selection
- Shift + click multi-selection
- Ctrl + click multi-selection
- Cmd + click multi-selection
- Drag rectangle selection
- Clicking empty canvas clears selection unless using a modifier
- Selected elements must show selection overlays
- Multiple selected elements must support moving together

Required behaviors:

```txt
Left click element:
  select only that element

Shift + click element:
  toggle element in selection

Ctrl/Cmd + click element:
  toggle element in selection

Left drag empty canvas:
  create selection rectangle

Drag selection rectangle over elements:
  select intersecting elements

Delete:
  delete selected elements

Escape:
  clear selection or cancel current tool
```

---

## Clipboard Rules

Implement all of the following:

- Ctrl/Cmd + C:
  - copy selected elements

- Ctrl/Cmd + V:
  - paste copied elements

- Ctrl/Cmd + D:
  - duplicate selected elements

Rules:

- Pasted elements must receive new UUIDs.
- Pasted elements must be offset slightly from the original.
- Pasted elements must preserve style and content.
- Pasted image elements should reference the same PNG asset unless explicit asset duplication is needed later.
- Pasting must be undoable.
- Duplicating must be undoable.

---

## Context Menu Rules

Right click must show a context menu.

Context menu options depend on target.

### Empty Canvas Context Menu

Possible actions:

- Add text
- Paste
- Toggle free/assisted placement mode
- Toggle grid visibility
- Reset viewport

### Element Context Menu

Possible actions:

- Delete
- Duplicate
- Copy
- Bring to front
- Send to back
- Bring forward
- Send backward
- Rotate
- Lock
- Unlock

Lock/unlock can be implemented later, but keep the design compatible.

### Text Element Context Menu

Additional actions:

- Edit text
- Change format
  - plain
  - markdown
  - tex
  - markdown-tex

### Image Element Context Menu

Additional actions:

- Edit perspective crop
- Remove transparent background
- Reset image transform if supported

---

## Grid and Placement Modes

There are two placement modes:

```ts
export type GridMode = "free" | "assisted";
```

### Free Mode

- Grid hidden by default.
- No snapping.
- Elements can be placed completely freely.
- Movement is continuous.

### Assisted Mode

- Grid visible by default.
- Snapping enabled.
- Movement snaps to `snapStep`.
- Resize snaps to `snapStep`.
- Grid is displayed at `gridSize`.
- Default `snapStep` is `10`.
- Default `gridSize` is `100`.

Rules:

- `gridSize` should usually be `snapStep * 10`.
- The user can toggle grid visibility.
- The user can switch between free and assisted modes.
- Switching modes must not change existing element positions automatically.
- Snapping applies only to active movement/resize operations.

---

## Canvas Element Base Type

Every canvas element must include:

```ts
export interface CanvasElementBase {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- `id` must be UUID.
- `rotation` is degrees unless otherwise specified.
- `zIndex` controls layer order.
- Higher `zIndex` appears above lower `zIndex`.
- All elements must be serializable to JSON.

---

## Canvas Element Types

Initial supported element types:

```ts
export type CanvasElementType =
  | "text"
  | "image"
  | "freehand"
  | "line"
  | "rect"
  | "ellipse"
  | "arrow";
```

Future supported element types may include:

```ts
export type FutureCanvasElementType =
  | "group"
  | "table"
  | "code-block"
  | "equation-block"
  | "sticky-note"
  | "embedded-note"
  | "link-card"
  | "mindmap-node";
```

Use discriminated union types.

Do not use `any` for canvas elements.

---

## Text Element

Text elements must store raw source content.

The canvas displays parsed/rendered output.

When a text element is selected, show a floating text editor near the selected element.

Do not require editing only in a side panel.

### Text Format

```ts
export type TextFormat =
  | "plain"
  | "markdown"
  | "tex"
  | "markdown-tex";
```

### Text Element Model

```ts
export interface TextElement extends CanvasElementBase {
  type: "text";
  width: number;
  height: number;
  content: string;
  format: TextFormat;
  style: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    padding: number;
    fontFamily?: string;
    borderColor?: string;
    borderWidth?: number;
  };
}
```

Rules:

- `content` stores the raw text.
- Rendered Markdown/TeX output must not replace `content`.
- The floating editor displays raw `content`.
- The canvas element displays parsed/rendered content.
- Editing should update the element through commands.
- Text edit history should be grouped, not one undo step per keystroke.
- Use IME-safe text input behavior.

### Floating Text Editor

The floating editor must:

- appear near the selected text element
- show raw source text
- allow changing format
- support plain text
- support Markdown
- support TeX
- support Markdown + TeX
- update preview/rendered element
- avoid covering the selected element when practical
- remain usable while panning/zooming

---

## Image Element

All imported images must be stored as PNG.

### Image Element Model

```ts
export interface ImageElement extends CanvasElementBase {
  type: "image";
  width: number;
  height: number;
  src: string;
  sourceType: "image" | "pdf-page";
  originalFileName?: string;
  pageNumber?: number;
  importInfo?: {
    importedAt: string;
    pdfScale?: number;
    transparentBackgroundApplied?: boolean;
    perspectiveTransformApplied?: boolean;
  };
}
```

Rules:

- `src` must be relative to the note directory.
- `src` must point to a PNG file.
- The original image file must not be stored.
- If the original image was JPG/JPEG/WebP/etc., convert it to PNG during import.
- If transparent background processing is applied, save the processed PNG.
- If perspective correction is applied, save the corrected PNG.
- Do not embed image data in JSON.

---

## Image Import Rules

Image import must:

1. Read the selected image file.
2. Decode it in the browser or local server.
3. Optionally allow transparent background processing.
4. Optionally allow perspective correction.
5. Convert the final image to PNG.
6. Save the PNG under the note's `assets/images/` directory.
7. Create an `image` canvas element.
8. Store only the PNG path in `note.json`.

Persistent paths must look like:

```txt
assets/images/<assetId>.png
```

Example:

```json
{
  "id": "91d76500-0f2f-4316-aa27-9a759123be22",
  "type": "image",
  "x": 100,
  "y": 200,
  "width": 800,
  "height": 600,
  "rotation": 0,
  "zIndex": 12,
  "src": "assets/images/6f18420b-4e95-4c1a-9e31-401dc0e311e5.png",
  "sourceType": "image",
  "originalFileName": "プリント写真.jpg",
  "importInfo": {
    "importedAt": "2026-05-29T00:00:00.000Z",
    "transparentBackgroundApplied": true,
    "perspectiveTransformApplied": true
  }
}
```

---

## Transparent Background Processing

Image import must support a transparent background feature.

This feature is used during image import.

The result must be saved as PNG.

Possible initial implementations:

- remove near-white background
- remove selected color
- tolerance slider
- preview before import

Required initial data compatibility:

```ts
export interface TransparentBackgroundOptions {
  enabled: boolean;
  mode: "none" | "near-white" | "picked-color";
  tolerance: number;
}
```

Rules:

- The processed result must become the saved PNG.
- Do not store the original image.
- Store in `importInfo.transparentBackgroundApplied`.
- The feature should be optional during import.
- If disabled, still convert the imported image to PNG.

---

## Perspective Transform Import

Image import must support a future or initial perspective correction workflow.

Goal:

- The user can import a photo of a printed document taken at an angle.
- The user can select four corners.
- The app transforms the selected quadrilateral into a rectangle.
- The corrected result is saved as PNG.

Required workflow:

1. User selects image file.
2. Import preview opens.
3. User may select four points.
4. These four points define the document corners.
5. The app performs perspective transform.
6. The transformed rectangle is saved as PNG.
7. The PNG is inserted as an image element.

Required point order:

```txt
top-left
top-right
bottom-right
bottom-left
```

Required data compatibility:

```ts
export interface PerspectiveTransformOptions {
  enabled: boolean;
  points?: {
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
  };
  outputWidth?: number;
  outputHeight?: number;
}
```

Rules:

- Perspective correction is applied at import time.
- The corrected PNG is the saved asset.
- The original image is discarded.
- Store in `importInfo.perspectiveTransformApplied`.
- The image element itself is still a rectangle on the canvas.
- Canvas resize and rotation are separate from import-time perspective correction.

---

## Image Resize Rules

Image elements must support free resizing.

Required behavior:

- Width and height can be changed independently.
- Rotation is required.
- Moving corner handles should preserve aspect ratio by default.
- There must be a way to freely change width and height independently.
- Edge handles may resize one axis.
- Corner handles preserve the same scale by default.
- Modifier key behavior may be used to override aspect ratio.

Recommended behavior:

```txt
Corner drag:
  preserve aspect ratio

Shift + corner drag:
  free transform width and height

Edge drag:
  resize one axis

Rotation handle:
  rotate element
```

---

## PDF Import Rules

PDF import must:

1. User selects PDF.
2. User selects import quality.
3. App renders all pages.
4. Each page is saved as a separate PNG.
5. Original PDF is discarded.
6. Each page becomes an image element.
7. Pages are placed vertically.
8. User can move pages after import.

Original PDF files must not be saved.

### PDF Quality Options

Use these options:

```ts
export type PdfImportQuality =
  | "light"
  | "standard"
  | "high"
  | "ultra"
  | "custom";
```

Recommended scales:

```ts
export const PDF_IMPORT_SCALES = {
  light: 1.0,
  standard: 1.5,
  high: 2.0,
  ultra: 3.0
} as const;
```

Custom scale must be allowed.

### PDF Page Placement

Default placement:

```txt
vertical
```

Rules:

- Import all pages by default.
- Place pages from top to bottom.
- Page spacing should default to `40px`.
- Each page is an independent image element.
- After import, each page can be moved, resized, rotated, deleted, and layered independently.

Example generated paths:

```txt
assets/pdf-pages/<assetId>_page_001.png
assets/pdf-pages/<assetId>_page_002.png
assets/pdf-pages/<assetId>_page_003.png
```

Example element:

```json
{
  "id": "4d4164cc-4020-4d05-9f0a-3ad469d0f826",
  "type": "image",
  "x": 0,
  "y": 0,
  "width": 1240,
  "height": 1754,
  "rotation": 0,
  "zIndex": 5,
  "src": "assets/pdf-pages/869a4811-dc66-4c47-9181-8499f8fbf827_page_001.png",
  "sourceType": "pdf-page",
  "originalFileName": "lecture.pdf",
  "pageNumber": 1,
  "importInfo": {
    "importedAt": "2026-05-29T00:00:00.000Z",
    "pdfScale": 2.0
  }
}
```

---

## Freehand and Shape Elements

### Freehand Element

```ts
export interface FreehandElement extends CanvasElementBase {
  type: "freehand";
  points: Point[];
  style: {
    stroke: string;
    strokeWidth: number;
    lineCap: "round" | "butt" | "square";
    lineJoin: "round" | "bevel" | "miter";
  };
}
```

### Line Element

```ts
export interface LineElement extends CanvasElementBase {
  type: "line";
  points: [Point, Point];
  style: {
    stroke: string;
    strokeWidth: number;
  };
}
```

### Rect Element

```ts
export interface RectElement extends CanvasElementBase {
  type: "rect";
  width: number;
  height: number;
  style: {
    stroke: string;
    strokeWidth: number;
    fill: string;
  };
}
```

### Ellipse Element

```ts
export interface EllipseElement extends CanvasElementBase {
  type: "ellipse";
  width: number;
  height: number;
  style: {
    stroke: string;
    strokeWidth: number;
    fill: string;
  };
}
```

### Arrow Element

```ts
export interface ArrowElement extends CanvasElementBase {
  type: "arrow";
  points: [Point, Point];
  style: {
    stroke: string;
    strokeWidth: number;
    pointerLength: number;
    pointerWidth: number;
  };
}
```

---

## Future Shape Recognition

The app should be designed to support iPad-note-like shape recognition.

Future behavior:

- Draw a rough straight line and convert it to a line.
- Draw a rough rectangle and convert it to a rectangle.
- Draw a rough circle or ellipse and convert it to an ellipse.
- Draw a rough arrow and convert it to an arrow.

Architecture requirement:

- Keep freehand strokes and shape elements separate.
- Implement shape recognition under `src/features/shapeRecognition/`.
- Shape recognition should convert a `freehand` element into a shape element.
- The conversion must be undoable.

Example:

```txt
freehand -> line
freehand -> rect
freehand -> ellipse
freehand -> arrow
```

Do not mix shape recognition logic into the pen tool directly.

The pen tool may create a freehand element first, then call recognition logic.

---

## Z-Index and Layer Rules

All elements must have `zIndex`.

Higher `zIndex` renders above lower `zIndex`.

Required layer commands:

```txt
bringToFront
sendToBack
bringForward
sendBackward
```

Rules:

- New elements should appear at the current maximum zIndex + 1.
- Importing multiple PDF pages should assign increasing zIndex values.
- Layer operations must be undoable.
- Do not rely on array order alone for rendering order.
- Rendering should sort by `zIndex`.
- If two elements have the same `zIndex`, use stable ordering by creation time or array order.

Recommended utility functions:

```ts
export function getNextZIndex(elements: CanvasElement[]): number;

export function bringToFront(
  elements: CanvasElement[],
  targetIds: string[]
): CanvasElement[];

export function sendToBack(
  elements: CanvasElement[],
  targetIds: string[]
): CanvasElement[];

export function bringForward(
  elements: CanvasElement[],
  targetIds: string[]
): CanvasElement[];

export function sendBackward(
  elements: CanvasElement[],
  targetIds: string[]
): CanvasElement[];
```

---

## Rotation Rules

Rotation is required.

Supported elements:

- text
- image
- line
- rect
- ellipse
- arrow
- freehand if practical

Rules:

- Store rotation in degrees.
- Rotation must be undoable.
- Rotation handles should be available on selected elements.
- Multiple selected elements may rotate as a group in the future.
- Initial implementation may rotate one element at a time.

---

## Home Page Rules

The home page is shared by local edit mode and readonly pages mode.

The home page must show subjects.

Subjects are collapsible.

When a subject is opened, its notes are shown.

Notes must be displayed in user-defined order.

User-defined order is stored in JSON arrays.

### Required Local Edit Mode Home Actions

- create subject
- rename subject
- delete empty subject
- create note
- rename note
- delete note
- drag subject to reorder
- drag note inside subject to reorder
- open note

### Required Readonly Mode Home Actions

- open subject
- close subject
- open note

Readonly mode must not show active create/delete/reorder controls.

---

## Note Ordering Rules

Subject order:

```json
{
  "subjectOrder": [
    "subject-uuid-1",
    "subject-uuid-2"
  ]
}
```

Note order:

```json
{
  "noteOrder": [
    "note-uuid-1",
    "note-uuid-2"
  ]
}
```

Rules:

- Dragging subjects updates `manifest.subjectOrder`.
- Dragging notes updates `subject.noteOrder`.
- Do not infer order from filenames.
- Do not infer order from creation time.
- Do not rely on object key order.

---

## Subject Management Rules

Subject operations:

- Create subject
- Rename subject
- Delete subject only if empty

Rules:

- Subject IDs are UUIDs.
- Subject names may be Japanese.
- Subject folder names use UUIDs.
- Renaming a subject must not change its ID.
- Renaming a subject must not rename its folder.
- Deleting a subject with notes is not allowed.
- Display a clear error if the user tries to delete a non-empty subject.

---

## Note Management Rules

Note operations:

- Create note
- Rename note
- Delete note
- Reorder note
- Open note

Rules:

- Note IDs are UUIDs.
- Note titles may be Japanese.
- Note folder names use UUIDs.
- Renaming a note must not change its ID.
- Renaming a note must not rename its folder.
- Deleting a note must completely delete its note directory.
- Delete operation must show a confirmation dialog.
- Confirmation dialog must mention that related PNG assets will also be deleted.
- Since Git is the backup mechanism, no trash directory is required.

---

## Autosave Rules

Autosave is required.

Recommended behavior:

- Mark note as dirty immediately after an edit.
- Debounce autosave.
- Save after approximately 800ms to 1500ms of no edits.
- Save before leaving the note if possible.
- Save when the document becomes hidden if possible.
- Generate/update thumbnail during autosave or when leaving note.
- Show save status in the UI.

Required save statuses:

```ts
export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";
```

Rules:

- Autosave must validate data before writing.
- If validation fails, do not write invalid JSON.
- If save fails, show an error state.
- Do not silently lose changes.
- Autosave must be disabled in readonly mode.
- Readonly mode must never attempt to save.

---

## Thumbnail Rules

Thumbnail method:

```txt
Use the last viewed viewport.
```

Rules:

- Generate a thumbnail from the currently visible canvas area.
- Save it under `assets/thumbnails/thumbnail.png`.
- Store its relative path in `meta.json`.
- Generate thumbnail on autosave or when leaving note.
- If generation fails, do not fail the entire note save.
- If no thumbnail exists, show a fallback card.

---

## History System

Undo and redo are mandatory.

Use a command pattern.

Required commands:

```txt
AddElementCommand
DeleteElementCommand
UpdateElementCommand
MoveElementCommand
ResizeElementCommand
RotateElementCommand
ReorderElementCommand
ImportImageCommand
ImportPdfPagesCommand
PasteElementsCommand
DuplicateElementsCommand
ChangeGridModeCommand
ChangeElementStyleCommand
```

Command interface:

```ts
export interface HistoryCommand {
  id: string;
  label: string;
  do(state: CanvasState): CanvasState;
  undo(state: CanvasState): CanvasState;
}
```

Rules:

- Commands must be serializable if practical.
- Commands must not directly write files.
- Commands only update in-memory canvas state.
- Autosave persists the resulting state.
- Do not push viewport pan/zoom into history.
- Do not push selection-only changes into history.
- Text editing should be grouped into meaningful history entries.
- Importing a PDF should be one undoable command that removes all imported page elements and associated assets if necessary.
- Deleting elements must be undoable.

---

## Asset Deletion and Undo

Because assets are files, undo interactions require care.

Preferred initial behavior:

- When deleting an image element, do not immediately delete the PNG asset during the undoable operation.
- The element is removed from `note.json`.
- The asset may remain unused.
- A later cleanup script can remove unused assets.

Required cleanup script:

```txt
scripts/check-assets.ts
```

This script should detect:

- assets referenced by note JSON
- assets present on disk
- unused assets
- missing assets

Do not aggressively delete image assets during undoable canvas operations.

When deleting an entire note, delete the full note directory including assets.

---

## Import Commands and Assets

Image and PDF imports write PNG assets.

Rules:

- Asset write happens during import.
- The command adds corresponding elements.
- Undo removes elements from canvas state.
- Undo does not need to physically delete PNG files immediately.
- Asset cleanup can happen later.

This avoids breaking redo behavior.

---

## Keyboard Shortcuts

Required shortcuts:

```txt
Ctrl/Cmd + S:
  force save

Ctrl/Cmd + Z:
  undo

Ctrl/Cmd + Shift + Z:
  redo

Ctrl/Cmd + Y:
  redo

Delete:
  delete selected elements

Backspace:
  delete selected elements, unless text editor is focused

Escape:
  clear selection or cancel current tool

V:
  select tool

P:
  pen tool

T:
  text tool

L:
  line tool

R:
  rectangle tool

Space + drag:
  pan viewport

Ctrl/Cmd + C:
  copy selected elements

Ctrl/Cmd + V:
  paste selected elements

Ctrl/Cmd + D:
  duplicate selected elements
```

Rules:

- Shortcuts must not interfere with text input.
- If the floating text editor is focused, normal typing must work.
- Delete/Backspace must not delete elements while typing in a text box.
- Ctrl/Cmd + S should prevent the browser save dialog and trigger app save.

---

## Local API Server Rules

The local API server is required for local edit mode.

It must handle:

- reading manifest
- writing manifest
- reading subjects
- writing subjects
- creating subjects
- deleting empty subjects
- reading note metadata
- writing note metadata
- reading note JSON
- writing note JSON
- creating notes
- deleting notes
- writing PNG assets
- generating thumbnails
- validating paths

Routes should be separated by domain:

```txt
server/routes/manifestRoutes.ts
server/routes/subjectRoutes.ts
server/routes/noteRoutes.ts
server/routes/assetRoutes.ts
```

File operations must live in services:

```txt
server/services/fileStore.ts
server/services/subjectStore.ts
server/services/noteStore.ts
server/services/assetStore.ts
server/services/thumbnailService.ts
```

Rules:

- The server must prevent path traversal.
- The server must only write inside `public/data`.
- The server must validate UUIDs.
- The server must validate JSON before writing.
- The server must use atomic writes when practical.
- The server must return clear errors.

---

## GitHub Pages Deployment Rules

GitHub Pages mode is readonly.

Deployment must include:

```txt
dist/
```

Built from:

```txt
src/
public/data/
```

Rules:

- `public/data` must be included in the static build.
- The app must use relative paths compatible with GitHub Pages.
- The app must support repository subpath deployment.
- Vite `base` must be configured appropriately.
- No local API calls are allowed in readonly mode.
- The UI must hide or disable editing controls.

---

## Validation Rules

Use zod schemas for all persistent JSON.

Validate:

- manifest
- subject JSON
- note metadata
- note JSON
- canvas elements
- asset references

Rules:

- Validate before saving.
- Do not save invalid JSON.
- Display useful validation errors.
- Keep TypeScript types and zod schemas aligned.
- Include `schemaVersion` in every persistent JSON file.

---

## Migration Rules

Every persistent JSON file must include `schemaVersion`.

When changing the schema:

1. Add or update migration logic in `scripts/migrate-data.ts`.
2. Keep old data readable when practical.
3. Update example data.
4. Update this document if architecture changes.
5. Never silently change JSON shape without migration support.

---

## Rendering Rules

Canvas rendering must be separated from state mutation.

Do not mutate element objects directly inside rendering components.

Use explicit actions or commands.

Rendering order:

1. Sort elements by `zIndex`.
2. Render each element using a dedicated renderer.
3. Render selection overlays above elements.
4. Render floating editors and context menus in UI layer.

Suggested renderer structure:

```txt
CanvasElementRenderer
├── TextElementRenderer
├── ImageElementRenderer
├── FreehandElementRenderer
├── LineElementRenderer
├── RectElementRenderer
├── EllipseElementRenderer
└── ArrowElementRenderer
```

Do not put all element rendering logic in one massive component.

---

## State Management Rules

Canvas state should be centralized.

Minimum state:

```ts
export interface CanvasState {
  note: NoteData;
  selectedElementIds: string[];
  activeTool: CanvasTool;
  viewport: CanvasViewport;
  clipboard: CanvasClipboard | null;
  history: HistoryState;
  saveStatus: SaveStatus;
}
```

Rules:

- Persistent note data and temporary UI state must be separated.
- Selection is temporary state.
- Viewport is saved as last viewed viewport but does not need undo history.
- Active tool is temporary state.
- Save status is temporary state.
- Canvas elements are persistent state.

---

## UI Layout

### Home Page

Required UI:

- app title
- readonly/local edit mode indicator
- subject list
- collapsible subject sections
- note cards
- create subject button in local edit mode
- create note button in local edit mode
- drag handles for reorder in local edit mode
- no search in initial version

Search is intentionally not required in the initial version.

### Note Editor Page

Required UI:

- header
  - back button
  - note title
  - save status
  - readonly indicator if applicable

- toolbar
  - select tool
  - pen tool
  - text tool
  - line tool
  - rect tool
  - ellipse tool
  - arrow tool
  - image import
  - PDF import
  - grid/free mode toggle
  - undo
  - redo

- canvas
  - infinite viewport
  - grid overlay when applicable
  - elements
  - selection overlays

- floating text editor
  - appears for selected text element

- context menu
  - appears on right click

---

## Initial Version Scope

Implement these first:

1. Project setup
2. Data model
3. Local API server
4. Storage adapters
5. Home page
6. Subject create/rename/delete empty
7. Note create/rename/delete
8. Subject reorder
9. Note reorder
10. Note editor page
11. Infinite canvas viewport
12. Pan and zoom
13. Selection
14. Basic text elements
15. Floating text editor
16. Autosave
17. Undo/redo
18. Image import as PNG
19. PDF import as PNG pages
20. Layer zIndex operations
21. GitHub Pages readonly mode

---

## Delayed Features

Do not implement these first unless explicitly requested:

- real-time collaboration
- cloud database
- login
- GitHub OAuth
- direct push to GitHub from the app
- mobile editing
- OCR
- handwriting recognition
- advanced shape recognition
- full rich text editor
- embedded videos
- audio notes
- link previews
- full-text search
- trash system
- separate backup system

However, keep the architecture compatible with future implementation.

---

## Code Quality Rules

- Use TypeScript.
- Avoid `any`.
- Prefer explicit types.
- Prefer small files.
- Prefer feature-based structure.
- Keep React components focused.
- Keep file IO out of React components.
- Keep storage behind adapters.
- Keep canvas math in utility files.
- Keep import processing in importer modules.
- Keep history logic in history modules.
- Keep shape recognition in shape recognition modules.
- Do not create giant files.
- Do not mix unrelated responsibilities.
- Do not hardcode absolute paths.
- Do not rely on Japanese names for file paths.
- Do not embed binary data in JSON.
- Do not save original imported files.
- Always convert persistent images to PNG.
- Always validate before saving.
- Always support readonly mode safely.
- Run a TypeScript build or typecheck (`tsc` or equivalent) for code changes before considering them complete.
- Add or update unit tests for changed behavior whenever practical, especially for logic that should not regress.
- For user-visible behavior changes, plan a real-browser confirmation step with `@chrome` and ask the user to verify the observed result when interactive validation is needed.

---

## Full File Output Rule for AI Agents

When modifying or creating source files, output the complete file content.

Do not output only changed functions.

Do not omit imports.

Do not use placeholders such as:

```txt
// rest of file unchanged
```

Do not use:

```txt
...
```

inside source code to skip sections.

If a file becomes too large, propose splitting it into smaller files and then provide the complete content for each file.

---

## Error Handling Rules

Errors must be explicit.

Required visible errors:

- save failed
- validation failed
- import failed
- PDF render failed
- image conversion failed
- local API unavailable
- readonly mode write attempted
- missing asset
- missing note
- invalid JSON

Do not silently ignore errors.

Readonly write attempts must throw clear errors internally and show safe UI behavior externally.

---

## Path Rules

Paths stored in JSON should be relative to the note directory where appropriate.

For note assets:

```txt
assets/images/<assetId>.png
assets/pdf-pages/<assetId>_page_001.png
assets/thumbnails/thumbnail.png
```

Do not store OS-specific absolute paths.

Do not store local temporary file paths.

Do not store user home directory paths.

Do not use Japanese folder names.

---

## Security and Safety Rules

The local API server must:

- prevent path traversal
- restrict writes to `public/data`
- validate UUID path segments
- reject invalid filenames
- reject non-PNG persistent asset writes unless explicitly allowed later
- avoid overwriting unrelated files
- use safe JSON writing
- return structured errors

The frontend must:

- sanitize rendered Markdown where needed
- avoid executing arbitrary HTML from Markdown
- avoid unsafe script injection
- treat note JSON as untrusted input
- validate loaded data

---

## Markdown and TeX Rules

Markdown and TeX are display formats for text elements.

Rules:

- Store raw source text.
- Render Markdown using a dedicated renderer.
- Render TeX using a dedicated renderer.
- Markdown + TeX mode must support both.
- Do not execute arbitrary HTML.
- Do not permanently store rendered HTML as the source of truth.
- The source of truth is always `TextElement.content`.

---

## Suggested Development Scripts

Use scripts similar to:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "dev:client": "vite",
    "dev:server": "tsx server/index.ts",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "validate:data": "tsx scripts/validate-data.ts",
    "migrate:data": "tsx scripts/migrate-data.ts",
    "check:assets": "tsx scripts/check-assets.ts"
  }
}
```

---

## Data Validation Script

`scripts/validate-data.ts` must eventually validate:

- manifest
- all subject JSON files
- all note metadata files
- all note JSON files
- all asset references
- missing PNG files
- invalid UUIDs
- duplicated IDs
- invalid order arrays
- note IDs referenced but missing
- subject IDs referenced but missing

---

## Asset Check Script

`scripts/check-assets.ts` must eventually detect:

- referenced assets
- existing assets
- unused assets
- missing assets
- non-PNG files in persistent image folders
- broken thumbnail references

Do not delete files automatically unless explicitly requested.

---

## Implementation Priority

Recommended phase order:

### Phase 1: Foundation

- Vite + React + TypeScript setup
- data model types
- zod schemas
- storage adapter interfaces
- local API server skeleton
- static readonly adapter
- sample data

### Phase 2: Home Page

- load manifest
- show subjects
- collapse/expand subjects
- show notes
- create subject
- rename subject
- delete empty subject
- create note
- rename note
- delete note
- reorder subjects
- reorder notes

### Phase 3: Canvas Core

- infinite canvas
- viewport pan
- viewport zoom
- coordinate conversion
- selection
- rectangle selection
- multi-selection
- context menu
- grid mode
- snapping

### Phase 4: Elements

- text element
- floating text editor
- image element
- freehand element
- line
- rect
- ellipse
- arrow
- rotation
- resizing
- zIndex operations

### Phase 5: History and Autosave

- command system
- undo
- redo
- dirty state
- autosave
- save status
- JSON validation before save

### Phase 6: Importers

- PNG image import
- convert all images to PNG
- transparent background processing
- perspective transform import
- PDF import
- PDF quality selection
- vertical PDF page placement

### Phase 7: GitHub Pages

- readonly mode
- static fetch
- disable editing controls
- build configuration
- GitHub Pages deployment

### Phase 8: Polish

- thumbnails
- keyboard shortcuts
- layer UI
- better errors
- asset checker
- data validator
- migration script

---

## Final Architecture Principle

mynote is not a simple drawing app.

It is a local-first, Git-managed, JSON-based, infinite-canvas note system.

The architecture must preserve these separations:

```txt
UI
  renders and captures input

Canvas tools
  convert user input into commands

History commands
  mutate in-memory state reversibly

Storage adapters
  read and write persistent data

Local API server
  performs filesystem operations

JSON data
  is the source of truth

PNG assets
  store all imported visual media
```

Do not collapse these layers into one file or one component.

Keep the system modular so that future features such as shape recognition, handwriting cleanup, better PDF workflows, layer panels, and full-text search can be added without rewriting the core.
