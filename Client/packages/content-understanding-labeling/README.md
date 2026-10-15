# content-understanding-labeling

Labeling UX for **Azure AI Content Understanding** as a self-contained web component, `<document-intelligence>` (Angular Elements; no peer dependencies).
Review the OCR words of a document, draw and edit field labels, signatures, selection marks and tables, and mark documents for training.
Ported from Microsoft's React [Form Recognizer Toolkit](https://github.com/microsoft/Form-Recognizer-Toolkit/).

```bash
npm install content-understanding-labeling
```

The package is a pre-built bundle: `polyfills.js`, `main.js` (ES module) + `chunk-*.js`, `styles.css`, `media/`, `assets/` and `pdf.worker.min.mjs`.
Serve **the whole folder** as static files; the scripts find their chunks and the pdf.js worker next to themselves.

## Use it in an Angular app

1. Copy the package to your build output (`angular.json` → `architect.build.options.assets`):

   ```json
   { "glob": "**/*", "input": "node_modules/content-understanding-labeling", "output": "labeling-tool", "ignore": ["package.json", "README.md", "LICENSE"] }
   ```

2. Load it when the labeling page opens (recommended: the bundle is large and its stylesheet resets `html, body`, so load it only where it is used):

   ```ts
   const base = new URL('labeling-tool/', document.baseURI).href;
   const css = await (await fetch(base + 'styles.css')).text();
   const style = document.createElement('style');
   style.textContent = css.replace(/url\((["']?)\.\/media\//g, `url($1${base}media/`).replace(/html,body\{[^}]*\}/, '');
   document.head.appendChild(style);
   await loadScript(base + 'polyfills.js');          // classic script
   await loadScript(base + 'main.js', 'module');     // ES module
   await customElements.whenDefined('document-intelligence');
   ```

   or, if it is the only page, add `labeling-tool/styles.css` to `styles` and the two scripts to `index.html`
   (`<script src="labeling-tool/polyfills.js"></script>` and `<script type="module" src="labeling-tool/main.js"></script>`).

3. Use the element (`schemas: [CUSTOM_ELEMENTS_SCHEMA]` in the standalone component):

   ```html
   <document-intelligence [attr.server-url]="filesApi" allow-table="true"></document-intelligence>
   ```

Any other framework or plain HTML works the same way: serve the folder, load `polyfills.js` then `main.js` (`type="module"`), add the tag.

## Attributes

| Attribute | Default | Description |
|---|---|---|
| `server-url` | `""` (same origin) | Base URL of the file API below; every storage call goes there. Use an absolute URL when the host runs under a path prefix. |
| `allow-table` | `true` | Offer the *Table* field type. |
| `allow-draw-region` | `true` | Show *Draw region* on the canvas. |
| `allow-add-fields` | `true` | Show the *+* button to create fields. |
| `worker-src` | next to the bundle | URL of `pdf.worker.min.mjs`. Only needed when the worker is served from another place. |

## File API the component calls

All paths are relative to `server-url`.

| Method | Path | Body / result |
|---|---|---|
| `GET` | `/` | `{ "success": true }` (connection check) |
| `GET` | `/files` | JSON array of file names in the folder |
| `GET` | `/files/{name}` | the file (documents as bytes; `*.json` as JSON) |
| `PUT` | `/files/{name}` | `{ "content": "<text>" }` — writes `<doc>.labels.json`, `fields.json` |
| `PUT` | `/files/{name}/metadata` | `{ "metadata": { "fortraining": "true" } }` — storage metadata only (*Mark for training*) |
| `DELETE` | `/files/{name}` | deletes a file |

For each document `<doc>` the component reads `<doc>.result.json` (Content Understanding analyze result, OCR words and fields) and reads/writes `<doc>.labels.json`.
Label coordinates of PDFs are in inches (decimals kept), of images in pixels.

## Changes compared with @shoebsd31/document-intelligence 0.0.1

* *Mark for training* switch (writes the `fortraining` metadata through `PUT /files/{name}/metadata`).
* `server-url` is used for every storage call.
* PDF label coordinates keep their decimals; labels, OCR words and tables are redrawn when switching to a document with another page size.
* All documents of a large folder load (thumbnails, page counts, OCR overlays), not only the last batch.
* The pdf.js worker ships in the package and is found next to the bundle (works under a path prefix); `worker-src` overrides it.

## License

MIT. Third-party licenses: `3rdpartylicenses.txt`.
