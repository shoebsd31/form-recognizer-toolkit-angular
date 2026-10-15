# content-understanding-labeling

A labeling user interface for **Azure AI Content Understanding**, packaged as a self-contained web component: `<document-intelligence>`.

Point it at a folder of documents and their Content Understanding results, and people can:

* browse the documents (PDF, TIFF, PNG, JPEG, BMP) with thumbnails and page navigation,
* see the OCR words Content Understanding found, overlaid on the page,
* create fields and label values by clicking words or drawing regions, including **tables**, **selection marks** and **signatures**,
* label exactly the fields of your analyzer — the field list comes from the analyzer definition (`analyzer.json`),
* correct labels proposed by an analyzer,
* mark documents **for training** (the flag is written to the label file and as storage metadata),

and the labels are saved in the **Content Understanding `labels.json` format**, ready to train or improve an analyzer.

It is built with Angular Elements but has **no peer dependencies**: the package is a pre-built bundle that runs in any web page — Angular, React, Vue, plain HTML.
It is an Angular port of Microsoft's React [Form Recognizer Toolkit](https://github.com/microsoft/Form-Recognizer-Toolkit/) labeling UX, adapted to Content Understanding.

---

## Contents

1. [Install](#install)
2. [What is in the package](#what-is-in-the-package)
3. [Quick start (plain HTML)](#quick-start-plain-html)
4. [Use it in an Angular application](#use-it-in-an-angular-application)
5. [Use it with React, Vue or another framework](#use-it-with-react-vue-or-another-framework)
6. [Attributes](#attributes)
7. [The file API the component needs](#the-file-api-the-component-needs)
8. [Files in the document folder](#files-in-the-document-folder)
9. [Using it with Content Understanding](#using-it-with-content-understanding)
10. [Working in the labeling UI](#working-in-the-labeling-ui)
11. [Serving under a path prefix, CSP and CORS](#serving-under-a-path-prefix-csp-and-cors)
12. [Read-only mode](#read-only-mode)
13. [Troubleshooting](#troubleshooting)
14. [Browser support](#browser-support)
15. [Changes compared with @shoebsd31/document-intelligence 0.0.1](#changes-compared-with-shoebsd31document-intelligence-001)
16. [License](#license)

---

## Install

```bash
npm install content-understanding-labeling
```

The package contains built files only. There is nothing to import from TypeScript: you **serve the package folder** as static files and load two scripts.

## What is in the package

| File | What it is |
|---|---|
| `polyfills.js` | Zone.js and polyfills. A classic script; load it first. |
| `main.js` | The web component (an ES module). Defines `<document-intelligence>`. |
| `chunk-*.js` | Code split out of `main.js`; loaded on demand by `main.js` from the same folder. |
| `styles.css` | The component's styles (PrimeNG icons, OpenLayers canvas, layout). |
| `media/` | Icon fonts referenced by `styles.css`. |
| `assets/` | Images used by the UI (table type illustrations). |
| `pdf.worker.min.mjs` | The pdf.js worker used to render PDFs. |
| `3rdpartylicenses.txt` | Licenses of the bundled third-party code. |

All scripts locate their chunks, the images and the pdf.js worker **relative to themselves**, so the folder works wherever you serve it (`/labeling-tool/`, `/app/vendor/labeling/`, a CDN …) as long as the files stay together.

---

## Quick start (plain HTML)

Copy `node_modules/content-understanding-labeling/` to a folder your web server serves (here `labeling-tool/`), then:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="labeling-tool/styles.css">
  <script src="labeling-tool/polyfills.js"></script>
  <script type="module" src="labeling-tool/main.js"></script>
  <style>
    document-intelligence { display: block; height: 100vh; }
  </style>
</head>
<body>
  <document-intelligence server-url="https://my-api.example.com/labeling" allow-add-fields="false"></document-intelligence>
</body>
</html>
```

`server-url` is the base URL of a small file API that serves the documents and stores the labels — see [The file API the component needs](#the-file-api-the-component-needs).

> **Note:** `styles.css` contains a global `html, body { height: 100%; overflow: hidden }` reset. That is fine for a page dedicated to labeling.
> In a larger application load the styles as shown in the next section, which removes that rule.

---

## Use it in an Angular application

### 1. Copy the package into the build output

In `angular.json`, under `projects.<app>.architect.build.options.assets`:

```json
{
  "glob": "**/*",
  "input": "node_modules/content-understanding-labeling",
  "output": "labeling-tool",
  "ignore": ["package.json", "README.md", "LICENSE"]
}
```

The files are now served at `<base href>labeling-tool/`.

### 2. Load the component when the labeling page opens (recommended)

The bundle is large (≈ 1 MB of JavaScript plus the pdf.js worker) and its stylesheet resets `html, body`. Loading it only on the page that uses it keeps the rest of your application fast and unaffected:

```ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LabelingLoader {
  private ready?: Promise<void>;

  /** Loads the styles and scripts once; resolves when <document-intelligence> is defined. */
  load(): Promise<void> {
    return (this.ready ??= this.loadOnce());
  }

  private async loadOnce(): Promise<void> {
    const base = new URL('labeling-tool/', document.baseURI).href;

    // styles: re-base the font URLs and drop the global html/body reset
    const css = await (await fetch(base + 'styles.css')).text();
    const style = document.createElement('style');
    style.id = 'cu-labeling-styles';
    style.textContent = css
      .replace(/url\((["']?)\.\/media\//g, `url($1${base}media/`)
      .replace(/html,body\{[^}]*\}/, '');
    document.head.appendChild(style);

    await this.script(base + 'polyfills.js', false);
    await this.script(base + 'main.js', true);
    await customElements.whenDefined('document-intelligence');
  }

  private script(src: string, module: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (module) s.type = 'module';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
}
```

### 3. Use the element

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { LabelingLoader } from './labeling-loader';

@Component({
  selector: 'app-labeling-page',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (ready()) {
      <!-- fields come from analyzer.json in the folder, so field editing is off -->
      <document-intelligence
        [attr.server-url]="filesApi"
        allow-table="true"
        allow-draw-region="true"
        allow-add-fields="false">
      </document-intelligence>
    } @else {
      <p>Loading the labeling tool…</p>
    }
  `,
  styles: [`document-intelligence { display: block; height: calc(100vh - 64px); }`],
})
export class LabelingPage {
  // absolute URL, so it is correct whatever the page's base href is
  filesApi = new URL('api/labeling', document.baseURI).href;
  ready = signal(false);

  constructor() {
    inject(LabelingLoader).load().then(() => this.ready.set(true));
  }
}
```

Use `[attr.server-url]` (attribute binding). `server-url` is read when the element starts: to show another folder, render a new element (for example with `@for (api of [filesApi]; track api)` or by toggling it off and on).

#### Alternative: global loading

If the whole application is the labeling tool, you can instead add `labeling-tool/styles.css` to `styles` in `angular.json` and the two scripts to `index.html`:

```html
<script src="labeling-tool/polyfills.js"></script>
<script type="module" src="labeling-tool/main.js"></script>
```

Your application must not load a second copy of zone.js in that case (or must load `polyfills.js` before its own bundle).

---

## Use it with React, Vue or another framework

Serve the folder, load `polyfills.js` and then `main.js` (as a module) — with the loader above or `<script>` tags — and render the tag.

**React**

```tsx
export function Labeling({ api }: { api: string }) {
  // custom element attributes are passed as strings
  return <document-intelligence server-url={api} allow-table="true" style={{ display: 'block', height: '100vh' }} />;
}
```

(With TypeScript, declare the element in `JSX.IntrinsicElements`.)

**Vue**

```vue
<template>
  <document-intelligence :server-url="api" allow-table="true" style="display:block;height:100vh" />
</template>
```

Tell Vue it is a custom element: `app.config.compilerOptions.isCustomElement = (tag) => tag === 'document-intelligence'`.

---

## Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `server-url` | string | `""` (same origin, site root) | Base URL of the [file API](#the-file-api-the-component-needs). Every storage call goes to `<server-url>/files…`. Use an **absolute** URL when your page is under a path prefix. |
| `allow-table` | boolean | `true` | Offer the **Table** field type when creating fields. |
| `allow-draw-region` | boolean | `true` | Show the **Draw region** tool on the canvas (label areas that have no OCR words, e.g. signatures or stamps). |
| `allow-add-fields` | boolean | `true` | Show the **+** button that creates new fields. **Set `false` for Content Understanding folders** (with `analyzer.json`): the field list comes from the analyzer and UI edits would not be kept. |
| `worker-src` | string | the `pdf.worker.min.mjs` next to the bundle | URL of the pdf.js worker. Only needed when you serve the worker from another place. Must be the same pdfjs-dist version as the bundle. |

Boolean attributes follow HTML conventions: `allow-table="false"` disables; `allow-table`, `allow-table=""` or `allow-table="true"` enables; no attribute keeps the default (`true`). In Angular you can also bind a real boolean: `[allowTable]="false"`.

---

## The file API the component needs

The component does not talk to Azure. It reads and writes files through a small REST API that **you** provide (usually a thin layer over a blob container or a folder). All paths are relative to `server-url`.

| Method | Path | Request body | Response |
|---|---|---|---|
| `GET` | `/` | – | `{ "success": true }` — connection check when the component starts |
| `GET` | `/files` | – | JSON array of every file name in the folder, e.g. `["invoice-1.pdf", "invoice-1.pdf.result.json", …]` |
| `GET` | `/files/{name}` | – | The file. Documents as bytes with their content type; `*.json` files as JSON. **404** when the file does not exist (the component expects 404 for optional files). |
| `PUT` | `/files/{name}` | `{ "content": "<file text>" }` | 2xx. Creates or replaces a text file (`<doc>.labels.json`, `fields.json`). |
| `PUT` | `/files/{name}/metadata` | `{ "metadata": { "fortraining": "true" } }` | 2xx. Sets **storage metadata** on an existing file (e.g. blob metadata). The content is not touched; a missing file may be ignored. |
| `DELETE` | `/files/{name}` | – | 2xx. Deletes a file. |

`{name}` is a plain file name in the folder (URL-encoded by the component). Writes to the same file are queued, so they arrive in order.

### Minimal example (Node.js + Express, local folder)

```js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const folder = path.resolve('data');               // the document folder
const app = express();
app.use(express.json({ limit: '50mb' }));
const file = (name) => {
  const p = path.join(folder, name);
  if (!p.startsWith(folder + path.sep)) throw new Error('invalid name');   // no path traversal
  return p;
};

app.get('/', (_req, res) => res.json({ success: true }));
app.get('/files', (_req, res) => res.json(fs.readdirSync(folder)));
app.get('/files/:name', (req, res) => {
  const p = file(req.params.name);
  if (!fs.existsSync(p)) return res.status(404).json(null);
  res.sendFile(p);
});
app.put('/files/:name', (req, res) => { fs.writeFileSync(file(req.params.name), req.body.content); res.json({}); });
app.put('/files/:name/metadata', (req, res) => {
  const p = file(req.params.name);
  if (fs.existsSync(p)) fs.writeFileSync(p + '.metadata.json', JSON.stringify(req.body.metadata));   // or blob metadata
  res.json({});
});
app.delete('/files/:name', (req, res) => { fs.rmSync(file(req.params.name), { force: true }); res.json({}); });

app.listen(4000);
```

With Azure Blob Storage, map the same routes onto a container: `GET /files` lists blob names, `PUT …/metadata` sets blob metadata (`fortraining`), and authorize the calls in your API — the component sends whatever cookies apply to `server-url` (same origin) and no other credentials.

---

## Files in the document folder

For a document `<doc>` (for example `letter.pdf`):

| File | Read / written | Required | Purpose |
|---|---|---|---|
| `<doc>` | read | yes | The document: `.pdf`, `.tif`/`.tiff`, `.png`, `.jpg`/`.jpeg`, `.bmp`. Every file with one of these extensions appears in the document list. |
| `<doc>.result.json` | read | recommended | The Content Understanding **analyze result** for the document. The component draws the OCR words from it (yellow boxes you can click), takes page sizes and units from it, and shows the analyzer's field values and confidence. |
| `<doc>.labels.json` | read + written | no | The labels in Content Understanding format. Created on the first save. |
| `analyzer.json` | read | **yes, for Content Understanding** | The Content Understanding **analyzer definition**. Its `fieldSchema` is the field list (names, types, tables). It is the source of truth: when it exists, `fields.json` is ignored. |
| `<doc>.ocr.json` | read | no | Legacy OCR result (Form Recognizer layout). Used only when there is no `.result.json`. |
| `fields.json` | read + written | no (legacy) | Field list used **only when there is no `analyzer.json`** (Form Recognizer-style projects without an analyzer). Written when people add or change fields in the UI. |

> **One field list per folder.** All documents in a folder are labeled against the same `analyzer.json`. Keep one folder (one `server-url`) per analyzer.

### `<doc>.result.json`

Save the response of the analyze operation as is (the JSON you get when polling the operation). Both shapes are accepted:

```json
{ "id": "…", "status": "Succeeded", "result": { "analyzerId": "…", "contents": [ { "markdown": "…", "pages": [ … ], "fields": { … } } ] } }
```

or just the `result` object. The analyzer must return word-level details (pages with `words`); see [Using it with Content Understanding](#using-it-with-content-understanding).

### `<doc>.labels.json` (Content Understanding format)

```json
{
  "$schema": "https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json",
  "fileId": "",
  "fieldLabels": {
    "SenderName": {
      "type": "string",
      "valueString": "Eng. Peter Mwangi",
      "spans": [ { "offset": 812, "length": 17 } ],
      "source": "D(1,1.0103,8.1162,2.6245,8.1162,2.6245,8.2702,1.0103,8.2702)"
    },
    "Items": {
      "type": "array",
      "valueArray": [
        { "type": "object", "valueObject": {
            "Description": { "type": "string", "valueString": "Widget", "source": "D(1,…)" },
            "Quantity":    { "type": "number", "valueNumber": 2,       "source": "D(1,…)" }
        } }
      ]
    }
  },
  "metadata": { "displayName": "letter.pdf", "type": "application/pdf", "createdOn": "1790000000000", "fortraining": true }
}
```

* `source` is `D(page, x1, y1, x2, y2, x3, y3, x4, y4)`, one quadrilateral per region (`;`-separated for several). Units follow the document: **inches for PDFs** (decimals kept), **pixels for images**.
* Tables are `array` fields of `object` rows.
* Older Form Recognizer label files (`labels: [ { label, value } ]`) are still read; they are saved in the Content Understanding format on the next save.

### `analyzer.json` (the field list)

The analyzer definition as Content Understanding returns it (`GET {endpoint}/contentunderstanding/analyzers/{analyzerId}?api-version=2025-11-01`), saved as is. Only `fieldSchema.fields` is used:

```json
{
  "analyzerId": "acmsletter1",
  "baseAnalyzerId": "prebuilt-document",
  "fieldSchema": {
    "fields": {
      "CorrespondenceDate": { "type": "date",   "method": "extract", "description": "Date written on the letter" },
      "SenderName":         { "type": "string", "method": "extract", "description": "Who signed the letter" },
      "Items": {
        "type": "array",
        "items": { "type": "object", "properties": {
          "Description": { "type": "string" },
          "Quantity":    { "type": "number" }
        } }
      }
    }
  }
}
```

* Every top-level field becomes a field in the list, in the order of the schema.
* `array` of `object` becomes a **table** (its `items.properties` are the columns); `object` becomes a group of sub-fields; `string`, `number`, `integer`, `date` and `time` keep their type; any other type (e.g. `boolean`) is labeled as `string`.
* A definition wrapped as `{ "analyzer": { … } }` or `{ "result": { … } }` is accepted too.
* **The field list cannot be edited in the UI while `analyzer.json` is present**: add or rename fields in the analyzer (Content Understanding Studio or the REST API), then replace `analyzer.json`. Set `allow-add-fields="false"` so nobody tries — fields added in the UI are written to `fields.json`, which is ignored as long as `analyzer.json` exists, so they would disappear on the next load.

### `fields.json` (legacy fallback)

Used only when the folder has **no** `analyzer.json`. The field list the UI maintains itself:

```json
{
  "fields": [
    { "fieldKey": "SenderName", "fieldType": "string", "fieldFormat": "not-specified" },
    { "fieldKey": "Items", "fieldType": "array", "fieldFormat": "not-specified", "itemType": "Items_object" }
  ],
  "definitions": {
    "Items_object": { "fieldKey": "Items_object", "fieldType": "object", "fieldFormat": "not-specified",
                      "fields": [ { "fieldKey": "Description", "fieldType": "string", "fieldFormat": "not-specified" } ] }
  }
}
```

Field types: `string`, `number`, `integer`, `date`, `time`, `selectionMark`, `signature`, `array` (tables, rows defined in `definitions`), `object`.

---

## Using it with Content Understanding

A typical loop:

1. **Analyze** each document with your analyzer (`POST {endpoint}/contentunderstanding/analyzers/{analyzerId}:analyzeBinary?api-version=2025-11-01`, then poll the operation) and store the final response as `<doc>.result.json` next to the document.
2. **Put the analyzer definition** (`GET …/analyzers/{analyzerId}`) in the folder as `analyzer.json`. This is what the component labels against: the field list, field types and tables all come from it, so the labels always match the analyzer you train. Render the element with `allow-add-fields="false"`.
3. **Label / correct** in the component. People click the yellow OCR words to assign them to fields, draw regions for signatures or areas without text, fill tables, and switch **Mark for training** on for good examples.
4. **Use the labels**: the `*.labels.json` files are in the format Content Understanding uses for labeled data, so the documents with `fortraining = true` can be copied to the training data of the analyzer (for example the blob container of a Content Understanding Studio project) to improve it.

Tips:

* Create the analyzer with word-level details (the result must contain `pages[].words`); without them there are no OCR boxes to click. If your analyzer does not return them, analyze the document once more with `prebuilt-read` and use that result for `<doc>.result.json` (or `<doc>.ocr.json`), keeping your analyzer's fields in `analyzer.json`.
* Keep one folder (or one `server-url` path) per analyzer: `analyzer.json` is per folder.
* When the analyzer changes (new field, renamed field), replace `analyzer.json`. Labels of fields that still exist keep working. Labels of a field that is no longer in the analyzer stay in the label file (saved as `string`) until someone removes them, so clean them up after renaming a field.

## Working in the labeling UI

| Action | How |
|---|---|
| Open a document | Click it in the document list on the left (thumbnails and page counts load for every document). |
| Label a value | Select a field on the right, then click words on the page — or select words first and choose the field. |
| Select several words | Hold **Shift** and drag a box, or Shift-click words. |
| Draw a region | **Draw region** (when `allow-draw-region` is on), click the corners; **Esc** cancels. |
| Create a field | Normally the fields come from `analyzer.json` (see above). Without an analyzer: **+** in the field list (when `allow-add-fields` is on): field, selection mark, signature or table (when `allow-table` is on). |
| Tables | Create a table field (fixed rows or dynamic rows), then label cell by cell. |
| Rename / delete / reorder fields | The field's menu and drag handle — only for `fields.json` projects; with `analyzer.json` change the analyzer instead. |
| Remove a label | The label's menu, or delete the drawn region. |
| Mark for training | The **Mark for training** switch at the top. Writes `metadata.fortraining` to the label file and storage metadata `fortraining` on the document, its labels and its result. |
| Pages, zoom | The pager and zoom buttons under the page. |

Labels are saved automatically after each change.

---

## Serving under a path prefix, CSP and CORS

* **Path prefix** (e.g. your app lives at `https://host/app/`): nothing to configure for the bundle — chunks, images and the pdf.js worker are resolved next to `main.js`. Give `server-url` as an absolute URL (`new URL('api/labeling', document.baseURI).href`).
* **Content Security Policy**: allow the bundle's origin in `script-src` (and `worker-src` for the pdf.js worker), `blob:` in `img-src` (page images are rendered to blobs), `style-src 'unsafe-inline'` if you inject the styles as a `<style>` tag (as the loader above does), and your file API in `connect-src`.
* **CORS**: when `server-url` is on another origin, that API must answer CORS requests for `GET`, `PUT`, `DELETE` with `Content-Type: application/json`. Cookies are not sent cross-origin; put authentication in front of the API (same origin + session cookie is simplest).

## Read-only mode

There is no single read-only switch. For reviewers who must not change labels:

* set `allow-add-fields="false"`, `allow-draw-region="false"`, `allow-table="false"`, and
* reject `PUT` / `DELETE` in your file API for those users (the real protection), and optionally hide the remaining edit controls with CSS, for example:

```css
document-intelligence .menu-button,
document-intelligence .delete-label-button,
document-intelligence .drag-handle,
document-intelligence .documentcard-delete-icon,
document-intelligence .delete-region-icon,
document-intelligence .training-toggle { display: none !important; }
```

(Class names are internal and may change between versions.)

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| The tag stays empty, no errors | `main.js` was not loaded as a module (`type="module"`), or `polyfills.js` was not loaded first. |
| "Failed to load …/chunk-XXXX.js" | The package files were not copied together, or a server rewrites unknown paths to `index.html`. Serve the whole folder as static files. |
| PDFs stay blank, console mentions the worker | `pdf.worker.min.mjs` is missing next to `main.js` or served with a wrong content type (must be JavaScript). Or `worker-src` points to another pdfjs version. |
| No yellow word boxes | `<doc>.result.json` is missing, or the analyzer did not return word details. See [Using it with Content Understanding](#using-it-with-content-understanding). |
| The field list is empty | No `analyzer.json` (with `fieldSchema.fields`) and no `fields.json` in the folder, or `GET /files/analyzer.json` does not return JSON. |
| Fields added in the UI disappear after a reload | The folder has an `analyzer.json`, which always wins over `fields.json`. Add the field to the analyzer and replace `analyzer.json`; use `allow-add-fields="false"`. |
| Labels are not saved | `PUT /files/{name}` fails (check the network tab): body must be read as JSON, size limit large enough for big label files. |
| "Mark for training" does not stick | `PUT /files/{name}/metadata` must succeed for `<doc>.labels.json`; the flag is also stored inside that file. |
| Icons show as squares | `styles.css` was copied without `media/`, or the font URLs were not re-based when injecting the styles. |
| Your page cannot scroll any more | The global `html, body` reset from `styles.css` applies; load the styles with the loader above (it removes that rule). |

## Browser support

Current versions of Chrome, Edge, Firefox and Safari (ES2022 modules, custom elements, web workers).

---

## Changes compared with @shoebsd31/document-intelligence 0.0.1

This package replaces `@shoebsd31/document-intelligence`:

* **Mark for training** switch: writes `metadata.fortraining` in the label file and `fortraining` storage metadata through `PUT /files/{name}/metadata`.
* `server-url` is used for **every** storage call (files, images, metadata).
* The field list comes from the Content Understanding **`analyzer.json`**; `fields.json` is only a fallback.
* Labels are written in the **Content Understanding** format; PDF coordinates keep their decimals (inches).
* Labels, OCR words and tables are redrawn when switching to a document with another page size.
* **All documents** of a large folder load (thumbnails, page counts, OCR overlays), not only the last batch.
* The **pdf.js worker ships in the package** and is found next to the bundle (works under a path prefix); new `worker-src` attribute.
* Images in `assets/` load from the package folder, not from the host page.
* `allow-table="false"`, `allow-draw-region="false"` and `allow-add-fields="false"` now really disable the feature (the string `"false"` used to count as true).

## License

MIT © shoebsd31. The bundled third-party code is listed with its licenses in `3rdpartylicenses.txt`.

Source: [github.com/shoebsd31/form-recognizer-toolkit-angular](https://github.com/shoebsd31/form-recognizer-toolkit-angular) (`Client/`). Issues and contributions are welcome there.
