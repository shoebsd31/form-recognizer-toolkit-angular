# Teaching an old labeling tool new tricks: moving the Form Recognizer Toolkit to Content Understanding

This article explains, in plain language, how we took Microsoft's **Form Recognizer Toolkit** (an Angular app for drawing labels on documents) and made it work with the **Azure AI Content Understanding (CU)** framework — its file format, its real API, and its Studio.

It's written for someone who has seen the toolkit but hasn't lived inside Azure's document APIs. We'll show the actual code where it helps.

---

## 1. First, the two things we're bridging

### Document Intelligence (the old world)

**Azure AI Document Intelligence** (formerly "Form Recognizer") extracts fields from forms. You train a *custom model* by drawing boxes around values ("this is the VendorName", "this is the InvoiceTotal") on sample documents. The toolkit in this repo is the UI for drawing those boxes.

It works with two files per document:

- `*.ocr.json` — the **layout**: every word the OCR found, with a pixel polygon and the page size.
- `*.labels.json` — your **labels**: which words belong to which field.

### Content Understanding (the new world)

**Azure AI Content Understanding** is the newer, broader service. Instead of "train a model to read a form", you describe an **analyzer** with a *field schema*, and it can **extract**, **classify**, and **generate** — across documents, images, audio, and video. Each field says *how* it should be filled:

```jsonc
"PaymentType": { "type": "string", "method": "classify", "enum": ["card", "cashless"] },
"Items":       { "type": "array",  "method": "generate", "items": { ... } },
"VendorName":  { "type": "string", "method": "extract" }
```

Its output file is `*.result.json`, and its labels file uses a different shape.

### The differences that actually mattered for the port

| Topic | Document Intelligence | Content Understanding |
| --- | --- | --- |
| Labels shape | `labels: [ { label, value } ]` (a **list**) | `fieldLabels: { VendorName: {…} }` (an **object** keyed by field) |
| Table/nested fields | flat keys like `Items/0/UnitPrice` | nested `valueArray` → `valueObject` |
| A field's value | `value[].text` (always a string) | typed: `valueString` / `valueDate` / `valueNumber` / `valueArray` … |
| Where boxes live | `boundingBoxes`: polygons **normalized 0–1** | `source`: `D(page,x1,y1,…)` polygons in **page pixels** |
| Text grounding | *(none)* | `spans: [{ offset, length }]` into the extracted text |
| OCR/layout file | `*.ocr.json` (`pages[].words[].polygon`) | `*.result.json` (`contents[].pages[].words[].source`) |
| How you call it | model-centric REST | analyzer-centric REST (`:analyzeBinary`, async + poll) |
| Studio storage | — | each doc is a **GUID blob with no extension** + `<GUID>.labels.json` |

Two of these caused almost all the work: **normalized-vs-pixel coordinates**, and **`source` strings vs `polygon` arrays**.

---

## 2. The same label, before and after

**Before** — Document Intelligence (`2021-03-01/labels.json`):

```json
{
  "labels": [
    { "label": "VendorName",
      "value": [ { "boundingBoxes": [[0.28,0.008, 0.47,0.004, 0.47,0.077, 0.28,0.080]],
                   "page": 1, "text": "BILLA" } ] }
  ]
}
```

**After** — Content Understanding (`2024-12-01-preview/labels.json`):

```json
{
  "$schema": "https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json",
  "fileId": "",
  "fieldLabels": {
    "VendorName": {
      "type": "string",
      "valueString": "BILLA",
      "spans": [{ "offset": 769, "length": 5 }],
      "source": "D(1,877,33,1449,20,1449,187,883,193)"
    }
  },
  "metadata": { "displayName": "testimg1.jpg", "type": "image/jpeg", "createdOn": "1790..." }
}
```

Notice the box went from four normalized numbers (`0.28…`) to pixels inside a `D(...)` string (`877,33…`), and a `spans` entry appeared. Those two transformations are the heart of the converter.

---

## 3. The coordinate problem (and how we solved it)

The toolkit stores boxes **normalized** (0–1), so they don't care about image size. CU stores boxes in **page pixels**. To convert, you need the page's pixel width and height — which come from the OCR/result file.

```ts
// normalized polygon  ->  one "D(page,x1,y1,...)" pixel segment
const polygonToSource = (polygon: number[], page: number, width: number, height: number) => {
    const nums: number[] = [];
    for (let i = 0; i < polygon.length; i += 2) {
        nums.push(Math.round(polygon[i]     * width));   // x: 0.28 * 3072 -> 877
        nums.push(Math.round(polygon[i + 1] * height));  // y: 0.008 * 4096 -> 33
    }
    return `D(${page},${nums.join(",")})`;
};

// and back again, when reading a CU file
const parseSource = (source: string, pageDims: CufPageDim[]) => {
    const boundingBoxes: number[][] = [];
    for (const seg of source.split(";")) {
        const m = seg.match(/^D\(([^)]*)\)$/);
        if (!m) continue;
        const parts = m[1].split(",").map(parseFloat);
        const page = parts[0];
        const dim = pageDims.find((d) => d.pageNumber === page);
        const normalized: number[] = [];
        for (let i = 1; i < parts.length; i += 2) {
            normalized.push(dim ? parts[i]     / dim.width  : parts[i]);
            normalized.push(dim ? parts[i + 1] / dim.height : parts[i + 1]);
        }
        boundingBoxes.push(normalized);
    }
    return { page, boundingBoxes };
};
```

**The rule we learned the hard way:** read and write must use the *same* page frame. If you write boxes using a 3072×4096 page and later read them back dividing by 1536×2048, every box doubles in size and slides off the page. (We hit exactly this when the page dimensions couldn't be found — see §7.)

---

## 4. Keeping the UI untouched: convert only at the file boundary

The important design choice: **the internal model and the whole UI stayed the same.** We only added a translation layer where files are read and written.

```
 *.labels.json  ──►  cufToInternalLabels()  ──►  internal Label[]  ──►  (canvas, unchanged)
 *.labels.json  ◄──  internalToCufLabels()  ◄──  internal Label[]  ◄──  (canvas, unchanged)
```

Writing a scalar field is just "pick the right typed value + build the `source`":

```ts
const buildCufScalar = (cufType, values, pageDims, fieldFormat) => {
    const text = values.map(v => v.text).filter(Boolean).join(" ").trim();
    const label: CufFieldLabel = { type: cufType };
    assignTypedValue(label, cufType, text, fieldFormat);   // date -> valueDate, number -> valueNumber, ...
    const spans = collectSpans(values);
    if (spans) label.spans = spans;
    const source = buildSource(values, pageDims);           // normalized boxes -> "D(...)" pixels
    if (source) label.source = source;
    return label;
};
```

Flat table keys like `Items/0/UnitPrice` are grouped back into the nested `valueArray` → `valueObject` shape on write, and exploded back into flat keys on read, so the rest of the app never sees the difference.

Reading is deliberately **format-tolerant** — a CU file (`fieldLabels`) is converted; a legacy file (`labels[]`) still loads and gets upgraded on the next save:

```ts
export const parseLabelsFile = (raw: string, pageDims: CufPageDim[]): Label[] => {
    const parsed = JSON.parse(raw);
    if (parsed?.fieldLabels) return cufToInternalLabels(parsed, pageDims); // CU
    return (parsed && parsed.labels) || [];                                // legacy DI
};
```

---

## 5. Talking to the *real* Content Understanding API

The toolkit originally only read/wrote files on a tiny local server. We added endpoints that call Azure CU for real, with everything configured through `.env` (endpoint, key, api-version, analyzer id, output folder).

CU's analysis is **asynchronous**: you upload the file, Azure hands back an `Operation-Location`, and you poll until it says `Succeeded`.

```ts
export const analyzeBinary = async (cfg, analyzerId, bytes, contentType = "application/octet-stream") => {
    // 1) upload the raw file bytes
    const res = await cuRequest(cfg, cuUrl(cfg, `/analyzers/${analyzerId}:analyzeBinary`), {
        method: "POST", contentType, body: bytes,
    });
    // 2) follow the Operation-Location header (or build it from the returned id)
    const resultUrl = res.headers.get("operation-location")
        ?? cuUrl(cfg, `/analyzerResults/${(await res.json()).id}`);
    // 3) poll until terminal
    return pollUntilDone(cfg, resultUrl);   // GET every ~2s until status === "Succeeded"
};
```

Authentication is a single header, `Ocp-Apim-Subscription-Key`. The endpoints we exposed:

| Endpoint | What it does |
| --- | --- |
| `POST /cu/analyze/:filename` | analyze a file → store `<filename>.result.json` |
| `POST /cu/analyzers/:id/train` | create/build ("train") an analyzer from a schema |
| `POST /cu/analyzers/:id/test` | analyze a file, return the result without saving |
| `POST /cu/labels/:filename` | turn a stored `*.result.json` into a CU `*.labels.json` |

> **Gotcha:** CU's `PUT /analyzers/{id}` won't overwrite an existing analyzer (it returns `409 ModelExists`). To change a setting (e.g. turn on `returnDetails` so results include word boxes) you must **delete then recreate** — and keep the `models` and `knowledgeSources` fields in the definition, or the rebuild fails because the `classify`/`generate` fields have no model to run on.

---

## 6. Generating a labels file from an analyzer result

Once CU analyzes a document, its `*.result.json` already contains the fields with their values, confidence, spans, and `source`. Producing a `*.labels.json` is mostly a faithful reshaping:

```ts
const convertScalar = (rf, declaredType = "string") => {
    const out: any = { type: rf.type || declaredType };
    const valKey = VALUE_KEYS.find(k => rf[k] !== undefined);   // valueString / valueDate / ...
    if (valKey) out[valKey] = rf[valKey];
    if (rf.spans?.length) out.spans = rf.spans;
    if (rf.confidence !== undefined) out.confidence = rf.confidence;
    const src = roundSource(rf.source);                          // round pixels to integers
    if (src) out.source = src;
    out.kind = "predicted";
    // a field with a value + a box is "succeed"; an empty field is "skip"
    out.metadata = valKey && src ? { mapStatus: "succeed", content: displayText(rf) }
                                 : { mapStatus: "skip" };
    return out;
};
```

The field **order** and the list of fields (including ones the analyzer left empty, which become `"mapStatus": "skip"`) come from the analyzer's own field schema, which the server fetches live from Azure.

---

## 7. Drawing the yellow OCR boxes from `*.result.json`

The canvas used to draw its faint yellow word boxes from `*.ocr.json`. We switched it to the CU `*.result.json`. The catch: CU words don't have a `polygon` array — they have a `source` string, and the pages are nested one level deeper (`contents[].pages[]`).

Rather than touch the canvas, we added an **adapter** that makes a CU result *look like* the old layout:

```ts
// factory picks the adapter by shape
static create(analyzeResult: any): IAnalyzeResultAdapter {
    if (analyzeResult && Array.isArray(analyzeResult.contents))   // CU has `contents`
        return new ContentUnderstandingAdapter(analyzeResult);
    return new V3AnalyzeResultAdapter(analyzeResult);             // legacy layout
}

// inside the CU adapter: source string -> the pixel polygon the canvas expects
const parseSourcePolygon = (source?: string): number[] => {
    const m = source?.match(/D\(([^)]*)\)/);
    if (!m) return [];
    return m[1].split(",").map(parseFloat).slice(1);  // drop the page number
};
```

Two debugging lessons from this step:

1. **CU tables are shaped differently** (grounded by `source`, not `boundingRegions`). Returning them to the old table layer crashed it, so the adapter returns `[]` for tables — the word overlay was the goal.
2. **Where page dimensions come from.** The field-label boxes briefly vanished because the code looked for dimensions in `*.ocr.json`, which doesn't exist for a CU-only document. With no dimensions, the pixel coordinates were never normalized, so the boxes flew off-screen. The fix was to read dimensions from `*.result.json` first:

```ts
for (const ext of [constants.resultFileExtension, constants.ocrFileExtension]) {
    const raw = await this.storageProvider.readText(`${name}${ext}`, true);
    if (raw) { const p = JSON.parse(raw); analyzeResult = p.result ?? p.analyzeResult ?? p; break; }
}
```

The yellow boxes are intentionally faint (`rgba(255,252,127,0.2)`) — easy to miss until you zoom in.

---

## 8. The Content Understanding Studio naming gotcha

The last surprise had nothing to do with the format and everything to do with **file names**.

When you upload labeled data for CU Studio, Studio builds a URL like:

```
GET .../labelingProjects/<project>/labels/<labelId>/document
```

…where `<labelId>` is the blob's base name with `.labels.json` stripped off. Every working document in the project was stored as a **GUID with no extension**:

```
d6cd2c59-205c-44d3-8281-f0e6db0e3d05            <- the image (no .jpg!)
d6cd2c59-205c-44d3-8281-f0e6db0e3d05.labels.json
d6cd2c59-205c-44d3-8281-f0e6db0e3d05.result.json
```

Our file was `testimg1.jpg`, so Studio asked for `.../labels/testimg1.jpg/document` and Azure answered **`400 — the parameter labelId is invalid`** (the `.jpg` isn't a valid id). The original filename is supposed to live only inside `metadata.displayName`.

So `/cu/labels` grew a `?studio=true` mode that writes a ready-to-upload trio:

```ts
const labelId = (req.query.labelId as string) || randomUUID();
await writeFile(join(studioDir, `${labelId}.labels.json`), JSON.stringify(labels, null, 2));
await writeFile(join(studioDir, `${labelId}.result.json`), JSON.stringify(resultJson, null, 2));
await copyFile(join(dataDir(), filename), join(studioDir, labelId));  // image, NO extension
```

Upload those three and Studio loads the document correctly.

---

## 9. The map of what changed

**Client (Angular)** — translation only, UI untouched:

- `models/cuf-labels.ts`, `utils/cuf-labels/index.ts` — the CU labels types + converter.
- `adapters/analyze-result-adapter/` — the `ContentUnderstandingAdapter` for the OCR overlay.
- `custom-model-label-page.component.ts` — load `*.result.json`, resolve page dims.
- `services/asset-service/custom-model-asset.service.ts` — read/write CU labels.

**Server (Express)** — new capability:

- `utils/contentUnderstandingClient.ts` — the real CU REST client (analyze / build / poll).
- `utils/resultToLabels.ts` — result → CU labels converter.
- `controllers/contentUnderstandingController.ts`, `routes/contentUnderstanding.ts` — the `/cu/*` endpoints.
- `sample.env` — all configuration, nothing hard-coded.

---

## 10. Takeaways

- **Convert at the boundary.** Translating files on the way in and out meant a brand-new format with zero changes to the UI.
- **Coordinates are a contract.** Pixels vs normalized, and *which* page size, must agree on read and write — most of the visible bugs were a frame mismatch.
- **Adapters beat rewrites.** Making the new result *look like* the old layout kept the canvas, styler, and selection logic exactly as they were.
- **The last mile is naming.** The format can be perfect and still fail because a blob is called `testimg1.jpg` instead of a bare GUID. Match the platform's conventions, not just its schema.

Document Intelligence taught the toolkit to *draw* labels. Content Understanding asks it to speak a richer language — typed values, text spans, pixel grounding, and multi-modal analyzers — and, as it turns out, to name its files the way the new platform expects.
