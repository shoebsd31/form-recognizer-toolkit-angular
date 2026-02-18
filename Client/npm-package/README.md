# @shoebsd31/document-intelligence

A self-contained `<document-intelligence>` web component for document labeling UX, built with Angular Elements. This package bundles everything needed — no peer dependencies required.

Mapped from the React-based [Microsoft Form Recognizer Toolkit](https://github.com/microsoft/Form-Recognizer-Toolkit/) to Angular.

## Installation

```bash
npm install @shoebsd31/document-intelligence
```

## Usage in Angular

### 1. Configure `angular.json`

Add the package's assets and styles to your build configuration:

```json
{
    "architect": {
        "build": {
            "options": {
                "assets": [
                    { "glob": "**/*", "input": "public" },
                    {
                        "glob": "**/*",
                        "input": "node_modules/@shoebsd31/document-intelligence",
                        "output": "assets/document-intelligence"
                    }
                ],
                "styles": [
                    "node_modules/@shoebsd31/document-intelligence/styles.css",
                    "src/styles.scss"
                ]
            }
        }
    }
}
```

### 2. Add script tags to `index.html`

```html
<body>
  <app-root></app-root>
  <script src="assets/document-intelligence/polyfills.js" type="module"></script>
  <script src="assets/document-intelligence/main.js" type="module"></script>
</body>
```

`polyfills.js` must be loaded **before** `main.js` (it provides zone.js).

### 3. Use the component

Add `CUSTOM_ELEMENTS_SCHEMA` to your component and use `<document-intelligence>` in the template:

```typescript
import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";

@Component({
    selector: "app-root",
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <document-intelligence
            [allowTable]="true"
            [allowDrawRegion]="true"
            [allowAddFields]="true"
        ></document-intelligence>
    `,
})
export class AppComponent {}
```

Use **property bindings** (`[allowTable]`), not attribute bindings (`[attr.allow-table]`), to pass correct boolean types.

### 4. Configure a proxy for the backend API

Create `proxy.conf.json`:

```json
{
    "/files": {
        "target": "http://localhost:4000",
        "secure": false,
        "changeOrigin": true
    }
}
```

Reference it in `angular.json`:

```json
"serve": {
    "options": {
        "proxyConfig": "proxy.conf.json"
    }
}
```

## Configurable Properties

| Property          | Type      | Default | Description                              |
| ----------------- | --------- | ------- | ---------------------------------------- |
| `serverUrl`       | `string`  | `""`    | Base URL for the file server API         |
| `allowTable`      | `boolean` | `true`  | Show table field type in the fields pane |
| `allowDrawRegion` | `boolean` | `true`  | Show the draw region tool on the canvas  |
| `allowAddFields`  | `boolean` | `true`  | Show the add fields button in the pane   |

When `serverUrl` is empty, API calls use relative paths (`/files/...`), which works with a dev server proxy.

## CSS Layout Requirements

The `<document-intelligence>` element uses flexbox internally and expects to fill its parent container. Ensure the parent has a defined height:

```css
document-intelligence {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
```

## Server API

The component expects a REST API at the configured server URL (or proxied path):

| Endpoint               | Method | Description        |
| ---------------------- | ------ | ------------------ |
| `/files`               | GET    | List all files     |
| `/files/:filename`     | GET    | Read a file        |
| `/files/:filename`     | PUT    | Write a file       |
| `/files/:filename`     | DELETE | Delete a file      |

See the [Server documentation](https://github.com/shoebsd31/form-recognizer-toolkit-angular) for details.

## Usage via CDN

```html
<link rel="stylesheet" href="https://unpkg.com/@shoebsd31/document-intelligence@latest/styles.css">
<script src="https://unpkg.com/@shoebsd31/document-intelligence@latest/polyfills.js" type="module"></script>
<script src="https://unpkg.com/@shoebsd31/document-intelligence@latest/main.js" type="module"></script>

<document-intelligence server-url="http://localhost:4000"></document-intelligence>
```

## License

MIT
