# Document Labeling UX - Angular Client

An Angular 17 application for document labeling with OCR annotations, field definitions, and label assignments. This is a full conversion of the original React client, built with standalone components, NgRx state management, and OpenLayers for canvas rendering.

## Tech Stack

- **Angular 17** - Standalone components, signals-ready
- **NgRx 17** - State management (Store, Effects, DevTools)
- **OpenLayers 6.14** - Map/canvas rendering for document annotation
- **PrimeNG 17** - UI component library (dialogs, buttons, tooltips)
- **Angular CDK** - Drag-and-drop for field reordering
- **angular-split** - Resizable split panes
- **pdfjs-dist** - PDF document rendering
- **utif** - TIFF image decoding
- **SCSS** - Styling with Fluent UI color variables

## Prerequisites

- Node.js 18+
- npm or yarn
- The local Express server running at `http://localhost:4000` (see `../Server`)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm start
```

Navigate to `http://localhost:4200/`. The app redirects to `/label` automatically.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start dev server at `http://localhost:4200` |
| `npm run build` | Production build to `dist/` |
| `npm run watch` | Build in watch mode |
| `npm test` | Run unit tests via Karma |

## Project Structure

```
src/app/
  adapters/                  # Analyze result adapter (OCR response normalization)
  components/                # Presentational (dumb) components
    image-map/               # Core OpenLayers canvas component
    image-map-toolbar/       # Zoom, rotate, pan controls
    page-control/            # Page navigation (prev/next/goto)
    layer-filter/            # Toggle text/table/checkbox visibility
    layout/                  # App shell with footer and loading overlay
    footer/                  # Application footer
    loading-overlay/         # Full-screen loading spinner
    message-modal/           # Confirmation/alert dialog
    table-view/              # OCR-detected table data viewer
    analyze-progress-bar/    # Analysis progress indicator
    buttons/                 # Reusable button components
  consts/                    # Colors and application constants
  containers/                # Smart (connected) components
    custom-model-label-page/ # Main page orchestrator
    document-gallery/        # Document list sidebar
    label-canvas/            # Canvas area with map + layer services
    label-pane/              # Field editor + label assignment
    inline-label-menu/       # Quick-label popup on feature select
  interceptors/              # HTTP interceptors (retry with backoff)
  models/                    # TypeScript interfaces and types
  providers/                 # StorageProviderService (HTTP file CRUD)
  services/                  # Layer services and asset management
    ocr-layer.service        # OCR text/checkbox feature management
    table-layer.service      # Table border/icon feature management
    custom-model-label.service # Label features, selection, hover
    asset-service/           # Custom model asset operations
  store/                     # NgRx state management
    canvas/                  # Image URL, dimensions, angle, hover state
    custom-model/            # Fields, labels, definitions, effects
    documents/               # Document list, current document, page
    predictions/             # OCR analyze results per document
    portal/                  # Loading overlays
  utils/                     # Utility functions
    document-loader/         # PDF, TIFF, and image loading
    custom-model/            # Field/label helper functions
    analyze-result/          # OCR result processing helpers
    styler/                  # OpenLayers feature style functions
    queue-map/               # Write queue for file operations
  types/                     # TypeScript declaration files
```

## Architecture Overview

The application follows a unidirectional data flow pattern:

1. **Components** dispatch actions to the NgRx store
2. **Reducers** update state immutably
3. **Effects** handle async operations (API calls, file I/O)
4. **Selectors** derive computed state for components
5. **Services** manage OpenLayers map layers and bridge between components and store

### Key Architectural Decisions

| Concern | Solution |
|---------|----------|
| State management | NgRx Store with 5 feature slices |
| Async operations | NgRx Effects with RxJS |
| Canvas rendering | OpenLayers 6 with multiple vector layers |
| Component communication | `@Input`/`@Output` + NgRx Store |
| HOC replacement | Injectable services (`OcrLayerService`, `TableLayerService`, `CustomModelLabelService`) |
| HTTP layer | Angular `HttpClient` with functional retry interceptor |
| UI components | PrimeNG + custom SCSS (Fluent UI colors) |
| Drag and drop | Angular CDK `DragDropModule` |
| Split panes | `angular-split` |

## Server Connection

The app connects to a local Express server at `http://localhost:4000` (configured in `src/environments/environment.ts`). The server provides:

- `GET /files` - List documents
- `GET /files/:name` - Read file (JSON or binary)
- `PUT /files/:name` - Write file
- `DELETE /files/:name` - Delete file

Document images, OCR results (`.ocr.json`), labels (`.labels.json`), and field definitions (`fields.json`) are all stored server-side.

## Key Workflows

### Document Labeling
1. Select a document from the gallery sidebar
2. OCR text boxes render as interactive features on the canvas
3. Click/drag to select text regions
4. Assign selected text to fields via the inline label menu or label pane
5. Labels persist automatically to `<document>.labels.json`

### Table Labeling
1. Add a table-type field (dynamic or fixed)
2. Click the table field to open the table pane
3. Select words on the canvas
4. Click a table cell to assign the selected words

### Field Management
1. Add fields via the "+" button (string, number, date, selection mark, signature, table)
2. Rename or delete fields via right-click context menu
3. Reorder fields via drag-and-drop
