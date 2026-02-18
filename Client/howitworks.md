# How It Works - Angular Component & Service Reference

This document explains how each component, service, and module in the Angular client works.

---

## Table of Contents

- [App Bootstrap](#app-bootstrap)
- [NgRx Store](#ngrx-store)
- [Services](#services)
- [Presentational Components](#presentational-components)
- [Container Components](#container-components)
- [Adapters](#adapters)
- [Utilities](#utilities)
- [Interceptors & Providers](#interceptors--providers)
- [Data Flow Diagrams](#data-flow-diagrams)

---

## App Bootstrap

### `app.config.ts`

Configures the Angular application with:
- **Router** - Single route: `/label` maps to `CustomModelLabelPageComponent`
- **HttpClient** - With a functional retry interceptor for transient errors
- **Animations** - Async animations for PrimeNG components
- **NgRx Store** - Five feature slices: `canvas`, `customModel`, `documents`, `predictions`, `portal`
- **NgRx Effects** - `DocumentsEffects` and `CustomModelEffects` for async operations
- **NgRx DevTools** - Enabled for debugging (max 25 actions)

### `app.routes.ts`

```
/       -> redirects to /label
/label  -> CustomModelLabelPageComponent
```

### `app.component.ts`

Root component that renders `<app-layout>`, which provides the shell structure.

---

## NgRx Store

The store is divided into five feature slices. Each has actions, a reducer, selectors, and a state interface.

### Canvas Slice (`store/canvas/`)

Manages the visual state of the document canvas.

**State:**
```typescript
{
  imageUrl: string | null       // Current document image data URL
  width: number                 // Image width in pixels
  height: number                // Image height in pixels
  angle: number                 // Rotation angle (0, 90, 180, 270)
  hoveredLabelName: string      // Currently hovered label name (for highlighting)
  visibleAnalyzedElement: {...} // Which OCR elements to display
}
```

**Actions:**
- `setCanvas` - Set image URL, dimensions, and reset angle
- `setAngle` - Set rotation angle
- `setHoveredLabelName` - Set the hovered label name (triggers feature highlighting)
- `setVisibleAnalyzedElement` - Toggle visibility of OCR element types

**Key Selectors:**
- `selectCanvas` - Full canvas state
- `selectHoveredLabelName` - Currently hovered label name
- `selectVisibleAnalyzedElement` - Visibility settings for OCR elements

### Documents Slice (`store/documents/`)

Manages the list of documents and which document is currently selected.

**State:**
```typescript
{
  documents: IDocument[]          // All loaded documents
  currentDocument: IDocument | null // Selected document
}
```

Each `IDocument` contains:
- `name` - Filename
- `url` - Server URL for the document
- `thumbnail` - Base64 thumbnail
- `numPages` - Page count
- `currentPage` - Currently viewed page
- `states.loadingStatus` - Loading/loaded/error
- `states.analyzingStatus` - Analyzing/analyzed

**Effects:**
- `loadDocuments$` - Fetches document list from server, loads thumbnails
- `setCurrentDocument$` - Loads the selected document (PDF/TIFF/image), sets canvas state
- `setCurrentPage$` - Reloads canvas when page changes

**How document loading works:**
1. `loadDocuments` action dispatched on page init
2. Effect calls `StorageProviderService.listFilesInFolder()` to get filenames
3. For each document, determines type (PDF/TIFF/image) and loads a thumbnail via `DocumentLoaderService`
4. Dispatches `loadDocumentsSuccess` with the document list
5. When user selects a document, `setCurrentDocument` loads the full image/page data
6. Canvas store is updated with image URL and dimensions

### Predictions Slice (`store/predictions/`)

Stores OCR analysis results per document.

**State:**
```typescript
{
  predictions: { [documentName: string]: IPrediction }
}
```

Each `IPrediction` contains:
- `name` - Document name
- `analyzeResponse.analyzeResult` - Full OCR result with pages, words, tables, selection marks

**Actions:**
- `setDocumentPrediction` - Store an OCR result for a document
- `setDocumentPredictions` - Store multiple OCR results at once

**No effects** - Predictions are loaded by `CustomModelLabelPageComponent` directly and dispatched into the store.

### Custom Model Slice (`store/custom-model/`)

The largest slice. Manages fields, labels, definitions, and all labeling operations.

**State:**
```typescript
{
  fields: Field[]                    // Field definitions (string, date, table, etc.)
  definitions: Definitions           // Table field sub-definitions (columns/rows)
  labels: Labels                     // { [docName]: Label[] } - per-document labels
  colorForFields: Record<string,string>[] // Field color assignments
  orders: { [docName]: { [id]: number } } // Region draw order per document
  labelValueCandidates: LabelValueCandidate[] // Currently selected features pending assignment
  labelError: ICustomModelError | null
  hideInlineLabelMenu: boolean
}
```

**Sync Actions (9):**
- `setFields`, `setDefinitions`, `setColorForFields` - Set state from server data
- `setLabelsByName` - Set labels for a specific document
- `setLabelValueCandidates` - Store selected features for label assignment
- `setHideInlineLabelMenu` - Show/hide the inline label popup
- `setColorForFieldsByName` - Update color when renaming a field
- `setLabelsAndField` - Batch update labels and fields
- `updateFieldsOrder` - Reorder fields via drag-and-drop

**Async Effects (14):**
- `addField` - Add a new field, save to `fields.json`
- `addTableField` - Add a table field with definition, save to `fields.json`
- `deleteField` - Delete field and its labels, save both files
- `renameField` - Rename field and update labels, save both files
- `switchSubType` - Change field type (string/number/date)
- `assignLabel` - Assign selected features to a field/cell
- `deleteLabelByField` - Remove all labels for a field
- `deleteLabelByLabel` - Remove a specific label
- `updateLabel` - Update label value from canvas edits
- `deleteTableField` - Remove a column/row from a table
- `insertTableField` - Add a column/row to a table
- `renameTableField` - Rename a table column/row
- `switchTableFieldsSubType` - Change table column type
- `updateTableLabel` - Update table labels after row insert/delete

**How label assignment works:**
1. User selects features on the canvas (click or drag-box)
2. `CustomModelLabelService` collects `LabelValueCandidate` objects and dispatches `setLabelValueCandidates`
3. User clicks a field in the label pane (or inline menu), dispatching `assignLabel({ labelName })`
4. The `assignLabel$` effect:
   - Gets current candidates from store
   - Removes duplicates
   - Validates the assignment (correct field type, same page)
   - Creates or merges the label
   - Saves to `<document>.labels.json`
   - Dispatches `assignLabelSuccess` to update store
   - Clears candidates and redraws label features

### Portal Slice (`store/portal/`)

Manages application-wide loading overlays.

**State:**
```typescript
{
  loadingOverlays: ILoadingOverlay[]  // Stack of loading messages
}
```

**Actions:**
- `addLoadingOverlay` - Push a loading message
- `removeLoadingOverlay` - Pop a loading message

---

## Services

Services replace the React HOC (Higher-Order Component) pattern. Each service manages a specific layer on the OpenLayers canvas.

### `OcrLayerService` (`services/ocr-layer.service.ts`)

Manages OCR text and checkbox features on the canvas.

**Initialization:** Receives the `ImageMapComponent` reference and subscribes to store changes.

**What it does:**
- Subscribes to `currentDocument`, `predictions`, and `visibleAnalyzedElement` selectors
- When a document's OCR data is available, draws text bounding box features on the text layer
- Draws checkbox/selection mark features on the checkbox layer
- Converts OCR coordinates (page-relative) to image-pixel coordinates
- Each feature stores metadata: `fieldKey`, region ID, `FeatureCategory`
- Clears and redraws when the document or page changes

**Key methods:**
- `initialize(imageMap)` - Set up store subscriptions
- `drawOcr(analyzeResult, targetPage)` - Create and add features
- `clearOcrFeatures()` - Remove all text and checkbox features

### `TableLayerService` (`services/table-layer.service.ts`)

Manages OCR-detected table border and icon features on the canvas.

**Initialization:** Receives the `ImageMapComponent` reference and subscribes to store changes.

**What it does:**
- Draws dashed border polygons around detected tables
- Draws table icons at the top-left corner of each table
- Handles tooltip display when hovering over table icons
- Opens a table view dialog when clicking a table icon
- Highlights all table borders when the table pane is opened

**Key methods:**
- `initialize(imageMap)` - Set up store subscriptions
- `drawTables(analyzeResult, targetPage)` - Create border and icon features
- `handleTableToolTipChange(...)` - Update tooltip position and state
- `handleTableIconClick()` - Open the table view dialog
- `highlightAllTables()` / `unhighlightAllTables()` - Bulk state changes

**Observables:**
- `tableIconTooltip$` - Emits tooltip position/size for the template
- `tableToView$` - Emits the table data when opening the table view

### `CustomModelLabelService` (`services/custom-model-label.service.ts`)

The most complex service. Manages label features, feature selection, hover highlighting, drawn regions, and the inline label menu.

**Initialization:** Receives the `ImageMapComponent` reference and subscribes to multiple store selectors.

**What it does:**
- Subscribes to `fields`, `labels`, `colorForFields`, `hoveredLabelName`, `currentDocument`
- When labels change, redraws label features on the label layer with correct colors
- Manages feature selection (single click, toggle, drag-box multi-select)
- Creates `LabelValueCandidate` objects from selected features
- Shows/positions the inline label menu after selection
- Handles hover highlighting: when `hoveredLabelName` changes, toggles the `HIGHLIGHTED_PROPERTY` on matching features
- Manages drawn regions (custom polygons drawn by the user)
- Handles double-click to open the inline label menu
- Manages keyboard events for the draw region workflow

**Key methods:**
- `initialize(imageMap)` - Set up subscriptions and event handlers
- `handleFeatureSelect(feature, isToggle, category)` - Process feature click
- `handleFinishFeatureSelect()` - Finalize selection, show inline menu
- `handleRegionDrawn(feature)` - Process a newly drawn region
- `handleFeatureModify(features)` - Update labels after region resize
- `handleDrawnRegionFeatureHovered(event, features)` - Show delete icon on hover

**Observables:**
- `inlineLabelMenu$` - Emits popup position and enabled field types
- `deleteRegionIcon$` - Emits position for the delete region icon

**Exposed stylers:**
- `labelFeatureStyler` - Colors labels by field, highlights on hover
- `drawRegionStyler` - Styles regions being drawn
- `drawnRegionStyler` - Styles completed drawn regions
- `modifyStyler` - Styles vertex handles during modification

### `CustomModelAssetService` (`services/asset-service/`)

Provides methods for reading and writing field and label files.

**Key methods:**
- `readFieldsFile()` - Read `fields.json`
- `writeFieldsFile(fields, definitions)` - Save fields and definitions
- `readLabelsFile(docName)` - Read `<doc>.labels.json`
- `writeLabelsFile(docName, labels)` - Save labels

### `StorageProviderService` (`providers/storage-provider.service.ts`)

HTTP client wrapper for server file operations. Uses a `QueueMap` to serialize writes to the same file.

**Methods:**
- `readText(filename)` - GET a JSON file
- `readBinary(filename)` - GET a binary file (images)
- `writeText(filename, content)` - PUT JSON content (queued)
- `deleteFile(filename)` - DELETE a file
- `listFilesInFolder()` - GET file listing
- `isFileExists(filename)` - Check file existence
- `isValidConnection()` - Health check

---

## Presentational Components

### `ImageMapComponent` (`components/image-map/`)

The core canvas component. Wraps OpenLayers to render the document image and multiple interactive vector layers.

**Inputs:**
- `imageUri` - Base64 data URL of the document image
- `imageWidth`, `imageHeight` - Image dimensions
- `imageAngle` - Rotation angle
- `initLayoutMap` - Whether to initialize editor layers
- `featureStyler` - Style function for text features
- `checkboxFeatureStyler` - Style function for checkbox features
- `tableBorderFeatureStyler` - Style function for table borders
- `tableIconFeatureStyler` - Style function for table icons
- `labelFeatureStyler` - Style function for label features
- `drawRegionStyler` - Style function for drawing regions
- `drawnRegionStyler` - Style function for completed drawn regions
- `modifyStyler` - Style function for modify handles
- `hoveringFeature` - ID of currently hovered feature
- `enableFeatureSelection` - Enable click/drag selection
- `drawRegionMode` - Enable polygon drawing mode

**Outputs (Events):**
- `setImageMap` - Emits the component reference after initialization
- `onMapReady` - Emits when the map is fully initialized
- `handleFeatureSelect` - Emits when a feature is clicked
- `onFinishFeatureSelect` - Emits when click/drag selection completes
- `handleTableToolTipChange` - Emits tooltip data for table icons
- `addDrawnRegionFeatureProps` - Emits when a new region is drawn
- `updateFeatureAfterModify` - Emits after a feature is resized
- `handleIsPointerOnImage` - Emits pointer-on-image state
- `handleDrawing` - Emits drawing state changes
- `handleVertexDrag` - Emits vertex drag state
- `handleIsSnapped` - Emits snap state

**Layers (in z-order):**
1. `imageLayer` - Static image layer (document)
2. `textLayer` - OCR text bounding boxes
3. `tableBorderLayer` - Table border polygons
4. `tableIconBorderLayer` - Table icon border layer
5. `tableIconLayer` - Table icon point features
6. `checkboxLayer` - Selection mark features
7. `podLayer` - Pod/grouped features
8. `drawnRegionLayer` - User-drawn regions
9. `drawnLabelLayer` - Label features (assigned labels)
10. `labelLayer` - Label overlay features
11. `drawingLayer` - Active drawing interaction layer

**Public API:**
- `addFeatures()`, `addTableBorderFeatures()`, `addLabelFeatures()`, etc. - Add features to layers
- `removeAllTextFeatures()`, `removeAllTableBorderFeatures()`, etc. - Clear layers
- `getAllFeatures()`, `getAllTableBorderFeatures()`, etc. - Get all features from layers
- `getFeatureByID()`, `getTableBorderFeatureByID()`, etc. - Find features by ID
- `zoomIn()`, `zoomOut()`, `resetZoom()`, `resetCenter()` - Zoom controls
- `getZoom()`, `getImageExtent()` - Read map state
- `toggleTextFeatureVisibility()`, `toggleTableFeatureVisibility()`, `toggleCheckboxFeatureVisibility()` - Layer visibility

### `ImageMapToolbarComponent` (`components/image-map-toolbar/`)

Toolbar with zoom in/out/fit and rotate controls.

**Inputs:** `disabled`, `zoomRatio`, `rotateAngle`
**Outputs:** `onZoomInClick`, `onZoomOutClick`, `onZoomToFitClick`, `onRotateClick`

### `PageControlComponent` (`components/page-control/`)

Page navigation with previous/next buttons and a page number input.

**Inputs:** `disabled`, `currentPage`, `numPages`
**Outputs:** `onPageChange`, `onPreviousClick`, `onNextClick`

### `LayerFilterComponent` (`components/layer-filter/`)

Dropdown checkbox filter to toggle visibility of text, table, and selection mark layers.

**Inputs:** `disabled`, `checkStates`
**Output:** `itemClick` - Emits the toggled layer item

### `LayoutComponent` (`components/layout/`)

Application shell. Contains `<router-outlet>`, `<app-footer>`, and `<app-loading-overlay>`. Subscribes to the portal store for loading state.

### `FooterComponent` (`components/footer/`)

Simple footer displaying application name and version.

### `LoadingOverlayComponent` (`components/loading-overlay/`)

Full-screen overlay with a spinner and message. Shown when async operations are in progress.

**Input:** `message` - Loading message to display

### `MessageModalComponent` (`components/message-modal/`)

PrimeNG Dialog wrapper for confirmation and alert modals.

**Inputs:** `isOpen`, `title`, `actionButtonText`, `rejectButtonText`
**Outputs:** `onActionButtonClick`, `onClose`
**Content:** Uses `<ng-content>` for the modal body

### `TableViewComponent` (`components/table-view/`)

PrimeNG Dialog that displays OCR-detected table data in a formatted HTML table.

**Input:** `tableToView` - A `StudioDocumentTable` object with rows, columns, and cells
**Output:** `handleTableViewClose`

**How it works:**
- Receives the table data from `TableLayerService.tableToView$`
- Builds a 2D grid from `table.cells` based on `rowIndex` and `columnIndex`
- Handles `rowSpan` and `columnSpan` for merged cells
- Renders cell content from the OCR text

### `AnalyzeProgressBarComponent` (`components/analyze-progress-bar/`)

Displays a progress bar during document analysis.

**Inputs:** `title`, `subtitle`, `percentComplete`

### Button Components (`components/buttons/`)

Reusable button variants: `DrawRegionButton`, `MenuButton`, `DeleteButton`.

---

## Container Components

### `CustomModelLabelPageComponent` (`containers/custom-model-label-page/`)

The main page orchestrator. Manages the full page layout with three resizable panes.

**Layout:**
```
+-------------------+-------------------------+-------------------+
| Document Gallery  |     Label Canvas        |    Label Pane     |
| (left sidebar)    |   (center - canvas)     |  (right sidebar)  |
+-------------------+-------------------------+-------------------+
```

Uses `angular-split` (`as-split`, `as-split-area`) for resizable panes.

**Responsibilities:**
- Loads documents on init (`loadDocuments` action)
- Loads fields and definitions from `fields.json`
- Loads labels from `<doc>.labels.json` when document changes
- Loads OCR data from `<doc>.ocr.json` and dispatches predictions
- Manages `isTablePaneOpen` state and passes it to the label pane
- Handles error display via `MessageModalComponent`

**Lifecycle:**
1. `ngOnInit` - Dispatch `loadDocuments`, call `getAndSetFields()`
2. Subscribe to `currentDocument` changes
3. On document change: load labels, load OCR, set up canvas
4. On predictions available: OCR/table/label services auto-redraw via their own subscriptions

### `DocumentGalleryComponent` (`containers/document-gallery/`)

Left sidebar showing the list of documents.

**Child components:**
- `DocumentPreviewListComponent` - Scrollable list of document thumbnails
- `DocumentPreviewComponent` - Individual document thumbnail with selection state

**How it works:**
- Subscribes to `selectDocuments` for the document list
- Subscribes to `selectCurrentDocument` for selection highlighting
- On click, dispatches `setCurrentDocument` action
- Shows "no documents" message when the list is empty

### `LabelCanvasComponent` (`containers/label-canvas/`)

The center pane containing the canvas, toolbar, and overlays.

**Template structure:**
```
+----------------------------------+
| Command Bar (Draw Region + Filter)|
+----------------------------------+
| Image Map (OpenLayers canvas)     |
|   - Table icon tooltip overlay    |
|   - Analysis progress overlay     |
+----------------------------------+
| Table View Modal (on demand)      |
| Inline Label Menu (on demand)     |
| Delete Region Icon (on demand)    |
+----------------------------------+
| Control Bar (Page Nav + Toolbar)  |
+----------------------------------+
```

**How it works:**
1. Renders `<app-image-map>` with all styler inputs bound from the three layer services
2. On `setImageMap` event, initializes all three services: `OcrLayerService`, `TableLayerService`, `CustomModelLabelService`
3. Forwards map events to the appropriate service methods
4. The table icon tooltip is positioned absolutely using `TableLayerService.tableIconTooltip$`
5. The table view dialog is bound to `TableLayerService.tableToView$`
6. The inline label menu is bound to `CustomModelLabelService.inlineLabelMenu$`
7. The delete region icon is bound to `CustomModelLabelService.deleteRegionIcon$`

### `LabelPaneComponent` (`containers/label-pane/`)

Right sidebar for field management and label assignment.

**Two views:**
1. **Field List View** (default) - Shows all fields with their labels via `<app-label-list>`
2. **Table Pane View** - Shows when a table field is clicked, with `<app-table-label-item>`

**Child components:**
- `LabelListComponent` - Renders the list of fields with drag-and-drop reordering
- `LabelItemComponent` - Individual field with label value, context menu, rename
- `TableLabelItemComponent` - Table grid with clickable cells for label assignment
- `FieldCalloutComponent` - Popup for creating a new field (with name input)
- `CreateTableModalComponent` - Dialog for creating a new table field (dynamic/fixed, header type)

**How field list works:**
1. `LabelListComponent` subscribes to `selectFields`, `selectLabels`, `selectColorForFields`
2. Each field renders as a `LabelItemComponent` showing the field name, type icon, and label value
3. Click on a regular field: dispatches `assignLabel` to assign selected features
4. Click on a table field: emits `tablePaneOpen` to switch to the table pane view
5. Hover: dispatches `setHoveredLabelName` to highlight features on the canvas
6. Drag-and-drop: dispatches `updateFieldsOrder`

**How table pane works:**
1. User clicks a table field (e.g., "Items" of type `array`)
2. `LabelPaneComponent.handleTablePaneOpen(field)` sets `isTablePaneOpen = true`
3. `TableLayerService.highlightAllTables()` highlights table borders on canvas
4. Template renders `<app-table-label-item>` with the field, definition, and labels
5. The table grid shows column headers from the definition and clickable cells
6. User selects words on canvas, then clicks a cell to assign them
7. `handleAssignLabel(cellLabelName)` dispatches `assignLabel`

### `InlineLabelMenuComponent` (`containers/inline-label-menu/`)

Popup menu that appears after selecting features on the canvas. Shows compatible fields that the selection can be assigned to.

**Inputs:** `showPopup`, `positionTop`, `positionLeft`, `enabledTypes`

**How it works:**
1. After feature selection, `CustomModelLabelService` calculates the popup position
2. Determines compatible field types based on the `FeatureCategory` (text, checkbox, drawn region)
3. The menu shows fields matching those types
4. Clicking a field dispatches `assignLabel` to assign the selected features

---

## Adapters

### `AnalyzeResultAdapterFactory` (`adapters/analyze-result-adapter/`)

Normalizes OCR analyze results from different API versions into a common interface.

**Interface (`IAnalyzeResultAdapter`):**
- `getDocumentPage(pageNumber)` - Get page dimensions and metadata
- `getDocumentPages()` - Get all pages
- `getDocumentTables()` - Get detected tables with bounding regions
- `getDocumentWords(page, targetPage)` - Get text words for a page
- `getDocumentSelectionMarks(page, targetPage)` - Get checkbox marks

Currently implements the v3.0.3 adapter format.

---

## Utilities

### Document Loaders (`utils/document-loader/`)

**`DocumentLoaderService`** - Factory that selects the correct loader based on file extension.

**Loaders:**
- `PdfLoader` - Uses `pdfjs-dist` to render PDF pages to canvas, returns base64 data URLs
- `TiffLoader` - Uses `utif` to decode TIFF files, renders to canvas
- `ImageLoader` - Loads standard images (JPG, PNG, BMP) via `<img>` element

Each loader implements:
- `setup(file: ArrayBuffer)` - Initialize with raw file bytes
- `loadPage(pageNumber)` - Render a specific page and return `{ imageUrl, width, height }`
- `pageCount` - Total number of pages

### Custom Model Utils (`utils/custom-model/`)

Helper functions for field and label manipulation:
- `encodeLabelString(value)` / `decodeLabelString(value)` - Handle special characters in label names
- `getFieldKeyFromLabel(label)` - Extract the field key from a compound label name
- `getColorByFieldKey(colorMap, fieldKey)` - Look up field color
- `getFieldColor(fields, fieldKey)` - Deterministic color assignment
- `getUnusedFieldColor(colorMap)` - Find the next available color
- `getDynamicTableRowNumberFromLabel(label)` - Extract row number from a table label
- `buildRegionOrders(labels)` - Build ordered map of drawn regions

### Analyze Result Utils (`utils/analyze-result/`)

- `isAnyBoundingRegionInPage(regions, page)` - Check if any bounding region is on a page
- `getPagePolygons(regions, page)` - Extract polygon coordinates for a page

### Styler Functions (`utils/styler/`)

OpenLayers style functions that return `ol/style/Style` objects based on feature properties:

- `defaultStyler` - Yellow bounding boxes for OCR text (green when selected)
- `checkboxStyler` - Pink bounding boxes for selection marks
- `labelStyler` - Colored bounding boxes based on field color, with highlight on hover
- `tableBorderFeatureStyler` - Dashed gray border (subtle when idle, prominent when hovered)
- `tableIconStyler` - Table icon glyph from "Segoe MDL2 Assets" font
- `customLabelStyler` - Label features without fill
- `drawRegionStyler` - Cyan polygons for drawn regions
- `modifyStyler` - Vertex handle icons for region editing
- `podStyler` - Blue/red outlines for pod features

### Queue Map (`utils/queue-map/`)

Serializes async operations per key. Used by `StorageProviderService` to prevent concurrent writes to the same file.

---

## Interceptors & Providers

### `RetryInterceptor` (`interceptors/retry.interceptor.ts`)

A functional HTTP interceptor that retries failed requests with exponential backoff.

- Retries on transient HTTP errors (408, 429, 500, 502, 503, 504)
- Up to 3 retry attempts
- Exponential delay: 1s, 2s, 4s

### `StorageProviderService` (`providers/storage-provider.service.ts`)

See [Services section](#custommodelassetservice-servicesasset-service) above.

---

## Data Flow Diagrams

### Document Selection Flow

```
User clicks document thumbnail
  -> DocumentGalleryComponent dispatches setCurrentDocument(doc)
  -> DocumentsEffects.setCurrentDocument$ effect
     -> Loads document via DocumentLoaderService (PDF/TIFF/Image)
     -> Dispatches setCurrentDocumentSuccess (updates documents state)
     -> Dispatches setCanvas (updates canvas state with image URL/dimensions)
  -> OcrLayerService subscription fires (currentDocument changed)
     -> Clears previous OCR features
     -> Draws new OCR features if predictions exist
  -> TableLayerService subscription fires
     -> Clears previous table features
     -> Draws new table features if predictions exist
  -> CustomModelLabelService subscription fires
     -> Clears previous label features
     -> Redraws labels for the new document
```

### Label Assignment Flow

```
User clicks/drags features on canvas
  -> ImageMapComponent emits handleFeatureSelect events
  -> LabelCanvasComponent.onFeatureSelect() calls labelService.handleFeatureSelect()
  -> CustomModelLabelService builds LabelValueCandidate[]
     -> Dispatches setLabelValueCandidates to store

User clicks a field in the label pane (or inline menu)
  -> Dispatches assignLabel({ labelName })
  -> CustomModelEffects.assignLabel$ effect
     -> Gets labelValueCandidates from store
     -> Validates assignment (type compatibility, same page)
     -> Creates/merges Label object
     -> Saves to <doc>.labels.json via CustomModelAssetService
     -> Dispatches assignLabelSuccess
     -> Clears labelValueCandidates
  -> CustomModelLabelService subscription fires (labels changed)
     -> Redraws label features with correct colors
```

### Table Pane Flow

```
User clicks a table-type field in label list
  -> LabelItemComponent.handleItemClick() emits clickTableField
  -> LabelListComponent.handleTablePaneOpen() emits tablePaneOpen
  -> LabelPaneComponent.handleTablePaneOpen(field)
     -> Sets isTablePaneOpen = true, tableFieldKey = field.fieldKey
     -> Calls TableLayerService.highlightAllTables()
  -> Template renders <app-table-label-item>
     -> Gets definition from store (e.g., "Items_object")
     -> Renders column headers and clickable cells

User selects words on canvas, then clicks a table cell
  -> TableLabelItemComponent emits clickCell with label name
  -> LabelPaneComponent.handleAssignLabel(labelName)
     -> Dispatches assignLabel({ labelName })
     -> Same flow as regular label assignment
```

### OCR Data Loading Flow

```
CustomModelLabelPageComponent.getAndSetOcr()
  -> For each document: reads <doc>.ocr.json from server
  -> Dispatches setDocumentPrediction for each
  -> PredictionsReducer stores { [docName]: prediction }
  -> OcrLayerService subscription fires (predictions changed)
     -> If current document has prediction, calls drawOcr()
     -> Creates text features from words array
     -> Creates checkbox features from selection marks
  -> TableLayerService subscription fires (predictions changed)
     -> If current document has prediction, calls drawTables()
     -> Creates border and icon features from tables array
```
