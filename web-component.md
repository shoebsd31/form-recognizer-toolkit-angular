# Using Document Intelligence as a Web Component

This guide explains how to build the Document Intelligence labeling UX as a Web Component and embed it in an existing Angular application.

## Build the Web Component

1. Install dependencies (if not already done):

```bash
cd Client
npm install
```

2. Build the web component bundle:

```bash
npm run build:element
```

This produces the output in `Client/dist/document-intelligence-element/`.

## Integrate into an Existing Angular Application

### Step 1: Copy the Build Output

Copy the contents of `Client/dist/document-intelligence-element/` into your Angular application's `src/assets/document-intelligence/` directory (or any location served as a static asset).

The key files you need are:

- `main.js` (and any chunk files like `chunk-*.js`)
- `polyfills.js`
- `styles.css`

### Step 2: Add Scripts and Styles to Your Angular App

In your host application's `angular.json`, add the web component files to the `build.options` section:

```json
"styles": [
    "src/assets/document-intelligence/styles.css",
    "src/styles.scss"
],
"scripts": [
    "src/assets/document-intelligence/polyfills.js",
    "src/assets/document-intelligence/main.js"
]
```

Alternatively, you can load them in your `index.html`:

```html
<link rel="stylesheet" href="assets/document-intelligence/styles.css">
<script src="assets/document-intelligence/polyfills.js"></script>
<script src="assets/document-intelligence/main.js"></script>
```

### Step 3: Allow Custom Elements in Your Component

In the Angular component where you want to use `<document-intelligence>`, add `CUSTOM_ELEMENTS_SCHEMA`:

```typescript
import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";

@Component({
    selector: "app-my-page",
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <document-intelligence></document-intelligence>
    `,
})
export class MyPageComponent {}
```

### Step 4: Use the Web Component

Add the `<document-intelligence>` tag in your template:

```html
<!-- All features enabled with default settings -->
<document-intelligence></document-intelligence>
```

## Configurable Options

The web component accepts the following attributes:

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `server-url` | `string` | `""` | Base URL of the file server API (e.g., `http://localhost:4000`). Leave empty if using a proxy. |
| `allow-table` | `boolean` | `true` | Show or hide the "Table" option in the field creation menu. |
| `allow-draw-region` | `boolean` | `true` | Show or hide the "Draw region" button on the canvas. |
| `allow-add-fields` | `boolean` | `true` | Show or hide the "+" button for creating new label fields. |

### Examples

```html
<!-- Custom server endpoint -->
<document-intelligence server-url="http://localhost:4000"></document-intelligence>

<!-- Disable table labeling and region drawing -->
<document-intelligence
    allow-table="false"
    allow-draw-region="false"
></document-intelligence>

<!-- Read-only label viewing (no field creation or region drawing) -->
<document-intelligence
    allow-add-fields="false"
    allow-draw-region="false"
></document-intelligence>
```

### Binding in Angular Templates

When using the web component inside an Angular template, you can bind to the attributes dynamically:

```html
<document-intelligence
    [attr.server-url]="apiUrl"
    [attr.allow-table]="enableTables"
    [attr.allow-draw-region]="enableRegions"
    [attr.allow-add-fields]="enableFields"
></document-intelligence>
```

## Server / API Setup

The web component expects a file server with the following REST endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/files` | List all filenames as a JSON array of strings |
| `GET` | `/files/:filename` | Read a file (returns JSON or binary content) |
| `PUT` | `/files/:filename` | Write a file (request body: `{ "content": "..." }`) |
| `DELETE` | `/files/:filename` | Delete a file |

### Option A: Use the Included Express Server

The repository includes a lightweight Express server under `Server/`. To run it:

```bash
npm run server
```

This starts the file server on port 4000, serving files from the `Server/data/` directory.

### Option B: Proxy Through Your Angular Dev Server

If your host Angular app uses `ng serve`, create a `proxy.conf.json`:

```json
{
    "/files": {
        "target": "http://localhost:4000",
        "secure": false,
        "changeOrigin": true
    }
}
```

Reference it in your `angular.json`:

```json
"serve": {
    "options": {
        "proxyConfig": "proxy.conf.json"
    }
}
```

With this setup, leave `server-url` empty (the default) so requests go to `/files` on the same origin.

### Option C: Implement the API in Your Own Backend

You can implement the four endpoints above in any backend (Node.js, .NET, Python, etc.) and set `server-url` to your API base URL.

## Preparing Documents for Labeling

Place the following files in the server's data directory (e.g., `Server/data/`):

1. **Document files** -- PDF, JPG, JPEG, PNG, TIFF, or TIF files you want to label.
2. **OCR result files** -- For each document, a corresponding `.ocr.json` file generated by Azure Form Recognizer's Layout API. The naming convention is `<filename>.<extension>.ocr.json` (e.g., `invoice.pdf.ocr.json` for `invoice.pdf`).

The following files are generated automatically when you start labeling:

- `<filename>.<extension>.labels.json` -- Label data for each document.
- `fields.json` -- Field definitions (label keys) shared across all documents.
