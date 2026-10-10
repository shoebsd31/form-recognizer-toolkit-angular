# Content Understanding server API

The server exposes endpoints that call the **real Azure AI Content Understanding (CU)**
REST API (GA `2025-11-01`) to analyze files, build ("train") analyzers, and test them.

All configuration is read from environment variables — copy `sample.env` to `.env`
and fill in the values. `.env` is git-ignored; never commit keys.

## Configuration (`.env`)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CU_ENDPOINT` | ✅ | — | CU/Foundry resource endpoint, e.g. `https://<res>.services.ai.azure.com` |
| `CU_API_KEY` | ✅ | — | Subscription key (sent as `Ocp-Apim-Subscription-Key`) |
| `CU_API_VERSION` | | `2025-11-01` | REST API version |
| `CU_ANALYZER_ID` | | — | Default analyzer for `/cu/analyze` when `?analyzerId=` is omitted |
| `CU_RESULTS_DIR` | | `Server/data` | Where `<filename>.result.json` is written |
| `CU_DATA_DIR` | | `Server/data` | Where files referenced by name are read from |
| `CU_ANALYZER_DEFINITION_FILE` | | — | Default analyzer definition for `/train` when no body is posted |
| `CU_POLL_INTERVAL_MS` / `CU_POLL_TIMEOUT_MS` | | `2000` / `300000` | Async polling cadence / timeout |
| `CU_MAX_UPLOAD` | | `100mb` | Max upload size for analyze/test |

## Endpoints (mounted under `/cu`)

### Analyze a file → store `<filename>.result.json`
```
POST /cu/analyze/:filename?analyzerId=<id>
```
Send the file bytes as the request body (`Content-Type: application/octet-stream`),
**or** omit the body to analyze an existing file read from `CU_DATA_DIR` by name.
The structured result is written to `CU_RESULTS_DIR/<filename>.result.json` and returned.

```bash
# upload a file
curl -X POST "http://localhost:4000/cu/analyze/receipt.jpg?analyzerId=receipt-1" \
  -H "Content-Type: application/octet-stream" --data-binary @receipt.jpg

# analyze a file already in Server/data
curl -X POST "http://localhost:4000/cu/analyze/IMG_20250920_114250.jpg?analyzerId=receipt-1"
```

### Generate labels.json from a result.json
```
POST /cu/labels/:filename?analyzerId=<id>
```
Reads `<filename>.result.json` (from `CU_RESULTS_DIR`, falling back to `CU_DATA_DIR`) and
writes a CUF `<filename>.labels.json` beside it — the format used in `cuf storage/` and by
the toolkit. No request body. Field order and completeness (including ungrounded fields
emitted as `mapStatus: "skip"`) come from the analyzer's `fieldSchema`, resolved from
`?analyzerId=`, the result's own `analyzerId`, `CU_ANALYZER_ID`, or `CU_ANALYZER_DEFINITION_FILE`;
if none is available the fields are derived from the result itself.

```bash
curl -X POST "http://localhost:4000/cu/labels/testimg1.jpg?analyzerId=analyzer1"
```

Each field is mapped to `{ type, value*, spans, confidence, source, kind: "predicted",
metadata: { mapStatus, content } }`; `source` polygons are rounded by unit: whole numbers for pixel pages (images), four decimals for inch pages (PDFs, `contents[].unit` = `inch`). OCR word boxes (`pages[].words`) only appear when the analyzer was built with OCR and **Return details** enabled; otherwise the workbench adds them with a second `prebuilt-read` analysis.
Implementation: [`Server/utils/resultToLabels.ts`](Server/utils/resultToLabels.ts).

**Studio mode (`?studio=true`)** — emit a trio ready to drop into a Content
Understanding Studio labeling container. CU Studio derives the `labelId` from the
blob base name and requires it to be **extension-less** (a GUID), so a file named
`testimg1.jpg.labels.json` is rejected with *"the parameter labelId is invalid"*.
With `studio=true` the server writes, into `CU_STUDIO_DIR` (default
`<CU_RESULTS_DIR>/studio`):

| File | Notes |
| --- | --- |
| `<GUID>` | the source image, **no extension** (Studio fetches it at `…/labels/<GUID>/document`) |
| `<GUID>.labels.json` | labels; original filename kept in `metadata.displayName`, `fileId: ""` |
| `<GUID>.result.json` | the analyzer result |

Pass `?labelId=<existing-guid>` to reuse a GUID (updates the same Studio document).
Upload all three to the project's `train/` prefix; delete any earlier
extension-named copies.

```bash
curl -X POST "http://localhost:4000/cu/labels/testimg1.jpg?studio=true&analyzerId=analyzer1"
# -> { labelId, studioDir, files: { document, labels, result }, documentWritten }
```

### Train (create/build) an analyzer
```
POST /cu/analyzers/:analyzerId/train
```
POST the analyzer definition (config + `fieldSchema`, see `cuf storage/analyzer.json`)
as a JSON body, or set `CU_ANALYZER_DEFINITION_FILE` and post an empty body. The server
PUTs the analyzer and polls the build to completion.

```bash
curl -X POST "http://localhost:4000/cu/analyzers/receipt-1/train" \
  -H "Content-Type: application/json" --data @analyzer-definition.json
```

### Test an analyzer (result **not** stored)
```
POST /cu/analyzers/:analyzerId/test
```
Uploads a file and returns the analyze result inline for quick verification.
```bash
curl -X POST "http://localhost:4000/cu/analyzers/receipt-1/test" \
  -H "Content-Type: application/octet-stream" --data-binary @receipt.jpg
```

### Analyzer status / delete
```
GET    /cu/analyzers/:analyzerId     # build status / definition
DELETE /cu/analyzers/:analyzerId     # delete the analyzer
```

## How it maps to the CU REST API

| Server endpoint | CU REST call(s) |
| --- | --- |
| `POST /cu/analyze/:filename` | `POST /analyzers/{id}:analyzeBinary` → poll `GET /analyzerResults/{id}` |
| `POST /cu/labels/:filename` | *(local conversion)* optional `GET /analyzers/{id}` for the field schema |
| `POST /cu/analyzers/:id/train` | `PUT /analyzers/{id}` → poll `Operation-Location` |
| `POST /cu/analyzers/:id/test` | `POST /analyzers/{id}:analyzeBinary` → poll `GET /analyzerResults/{id}` |
| `GET /cu/analyzers/:id` | `GET /analyzers/{id}` |
| `DELETE /cu/analyzers/:id` | `DELETE /analyzers/{id}` |

Implementation: [`Server/utils/contentUnderstandingClient.ts`](Server/utils/contentUnderstandingClient.ts),
[`Server/controllers/contentUnderstandingController.ts`](Server/controllers/contentUnderstandingController.ts),
[`Server/routes/contentUnderstanding.ts`](Server/routes/contentUnderstanding.ts).

> **Note on training with labels:** `/train` builds an analyzer from a definition
> (the CU "build" step). To train with the toolkit's labeled ground truth, upload
> that labeled data to blob storage and reference it in the analyzer definition —
> a follow-up that requires blob storage wiring.
