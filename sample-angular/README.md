# Sample Angular App - Document Intelligence Web Component

This sample Angular application demonstrates how to embed the `<document-intelligence>` web component into an existing Angular project.

## Prerequisites

- Node.js 18+
- Angular CLI 19+
- The web component build output from `Client/` (see [web-component.md](../web-component.md))
- The Express server running (provides the `/files` REST API)

## How the Web Component Is Integrated

### 1. Copy the web component build output

The pre-built web component files are placed in two locations:

- **`public/assets/document-intelligence/`** — JavaScript files (`main.js`, `polyfills.js`, `chunk-*.js`). Placed in `public/` so the Angular dev server (Vite) serves them directly without attempting to pre-transform them.
- **`src/assets/document-intelligence/`** — CSS (`styles.css`), fonts (`media/`), and images (`assets/`). These are processed by Angular's build pipeline.

### 2. Configure `angular.json`

The web component's global styles and static assets are registered in `angular.json`:

```json
"assets": [
  { "glob": "**/*", "input": "public" },
  {
    "glob": "**/*",
    "input": "src/assets/document-intelligence",
    "output": "assets/document-intelligence"
  }
],
"styles": [
  "src/assets/document-intelligence/styles.css",
  "src/styles.scss"
]
```

- The `assets` entry copies fonts, images, and other static files to `assets/document-intelligence/` in the build output.
- The `styles` entry includes the web component's global CSS (PrimeNG theme, layout styles, etc.).

### 3. Load the web component scripts in `index.html`

The web component's JavaScript is loaded via `<script type="module">` tags in `src/index.html`:

```html
<body>
  <app-root></app-root>
  <script src="assets/document-intelligence/polyfills.js" type="module"></script>
  <script src="assets/document-intelligence/main.js" type="module"></script>
</body>
```

- **`polyfills.js`** must be loaded **before** `main.js` because it provides `zone.js`, which Angular requires at runtime.
- Both the host app and the web component include `zone.js`, but zone.js handles double-loading gracefully (it detects an existing instance and skips re-initialization).

### 4. Use `CUSTOM_ELEMENTS_SCHEMA` in the host component

Angular needs `CUSTOM_ELEMENTS_SCHEMA` to allow unknown HTML elements like `<document-intelligence>`:

```typescript
import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
    selector: "app-root",
    standalone: true,
    imports: [FormsModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: "./app.component.html",
    styleUrl: "./app.component.scss",
})
export class AppComponent {
    allowTable = true;
    allowDrawRegion = true;
    allowAddFields = true;
}
```

### 5. Use the `<document-intelligence>` element in the template

The web component is used like any other HTML element, with Angular property bindings for configuration:

```html
<document-intelligence
    [allowTable]="allowTable"
    [allowDrawRegion]="allowDrawRegion"
    [allowAddFields]="allowAddFields"
></document-intelligence>
```

**Important:** Use property bindings (`[allowTable]`), not attribute bindings (`[attr.allow-table]`). Angular Elements defines property setters on the custom element that accept the correct types (booleans). Attribute bindings would pass string values (`"true"` / `"false"`), which break boolean checks.

### 6. Configurable properties

| Property          | Type      | Default | Description                              |
| ----------------- | --------- | ------- | ---------------------------------------- |
| `serverUrl`       | `string`  | `""`    | Base URL for the file server API         |
| `allowTable`      | `boolean` | `true`  | Show table field type in the fields pane |
| `allowDrawRegion` | `boolean` | `true`  | Show the draw region tool on the canvas  |
| `allowAddFields`  | `boolean` | `true`  | Show the add fields button in the pane   |

When `serverUrl` is left empty, API calls use relative paths (e.g., `/files`), which works with the dev server proxy.

### 7. CSS layout requirements

The `<document-intelligence>` element must be placed inside a flex container with a defined height. The web component's internal layout uses flexbox and expects to fill its parent:

```scss
.app-main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

document-intelligence {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
```

### 8. Proxy configuration for the file server API

A `proxy.conf.json` forwards `/files` requests to the Express server:

```json
{
    "/files": {
        "target": "http://localhost:4000",
        "secure": false,
        "changeOrigin": true
    }
}
```

This is referenced in `angular.json` under the `serve` target:

```json
"serve": {
    "options": {
        "proxyConfig": "proxy.conf.json"
    }
}
```

## Running the Sample

1. **Start the Express server** (from the repo root):

   ```bash
   PORT=4000 npm run server
   ```

2. **Start the sample app** (from `sample-angular/`):

   ```bash
   ng serve
   ```

3. Open `http://localhost:4200` in a browser.

## Project Structure

```
sample-angular/
├── public/
│   └── assets/document-intelligence/   # JS files (served directly by Vite)
│       ├── main.js
│       ├── polyfills.js
│       └── chunk-*.js
├── src/
│   ├── assets/document-intelligence/   # CSS, fonts, images (processed by Angular)
│   │   ├── styles.css
│   │   ├── media/                      # PrimeIcons font files
│   │   └── assets/images/              # Table type images
│   ├── app/
│   │   ├── app.component.ts            # Host component with CUSTOM_ELEMENTS_SCHEMA
│   │   ├── app.component.html          # Template using <document-intelligence>
│   │   └── app.component.scss          # Layout styles for the web component
│   ├── index.html                      # Script tags for polyfills.js and main.js
│   └── styles.scss                     # Global styles
├── proxy.conf.json                     # Proxy /files to Express server
└── angular.json                        # Build config with styles and assets
```
