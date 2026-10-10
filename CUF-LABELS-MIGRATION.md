# Migrating the toolkit's `*.labels.json` to the Content Understanding (CUF) format

**Date:** 2026-10-03
**Goal:** Make the Form Recognizer Toolkit produce (and read) label files in the **Azure AI Content Understanding** format so labels created/corrected here can be reused directly by Content Understanding.

> Scope agreed for this change: **generate labels in the CUF format** and **switch fully to CUF** for the labels file. Confidence UI is intentionally **out of scope** — confidence only exists in the CUF analyzer's `*.result.json` output, which this toolkit does not produce. OCR word boxes still come from the existing `*.ocr.json` (unchanged).
>
> **Nothing in the `cuf storage/` folder was modified** — it is used only as the reference for the target format.

---

## 1. What changed, in one sentence

The toolkit's internal label model and the entire UI are **unchanged**. Only the **file (de)serialization boundary** now converts between the internal `Label[]` model and the CUF `fieldLabels` schema.

```
                 ┌─────────────── unchanged ───────────────┐
  *.labels.json  │  internal Label[]  →  store  →  canvas   │  *.labels.json
  (CUF format) ──┼──►  cufToInternalLabels()                │
                 │                      internalToCufLabels() ──►  (CUF format)
                 └──────────────────────────────────────────┘
                   conversion lives in utils/cuf-labels
```

---

## 2. Before vs. after (same field, same document)

### Before — legacy Form Recognizer (`2021-03-01/labels.json`)
```json
{
  "$schema": ".../formrecognizer/2021-03-01/labels.json",
  "document": "inv.jpg",
  "labels": [
    {
      "label": "VendorName",
      "value": [
        { "boundingBoxes": [[0.964,0.216, 0.964,0.512, 0.855,0.512, 0.855,0.216]],
          "page": 1, "text": "Jurček\nStröck GmbH" }
      ],
      "labelType": "Words"
    },
    { "label": "Items/0/UnitPrice", "value": [ { "boundingBoxes": [[...]], "page": 1, "text": "1,90" } ] }
  ]
}
```

### After — Content Understanding (`2024-12-01-preview/labels.json`)
```json
{
  "$schema": "https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json",
  "fileId": "",
  "fieldLabels": {
    "VendorName": {
      "type": "string",
      "valueString": "Jurček\nStröck GmbH",
      "spans": [{ "offset": 0, "length": 6 }],
      "source": "D(1,3950,664,3950,1575,3505,1575,3505,664)"
    },
    "Items": {
      "type": "array",
      "valueArray": [
        { "type": "object", "valueObject": {
            "UnitPrice": { "type": "string", "valueString": "1,90", "source": "D(1,...)" },
            "Quantity":  { "type": "number", "valueNumber": 1,      "source": "D(1,...)" }
        } }
      ]
    }
  },
  "metadata": { "displayName": "inv.jpg", "type": "image/jpeg", "createdOn": "1790..." }
}
```

---

## 3. Field-by-field mapping

| Legacy (FR) | CUF | Notes |
| --- | --- | --- |
| `labels: [ { label, value } ]` | `fieldLabels: { <FieldName>: {…} }` | Array of labels → object keyed by field name. |
| `label: "VendorName"` | key `VendorName` | Scalar field. |
| `label: "Items/0/UnitPrice"` (flat) | `Items.valueArray[0].valueObject.UnitPrice` (nested) | Flat `Field/row/prop` keys are grouped into nested `valueArray` → `valueObject`. Reversed on read. |
| `value[].text` | `valueString` / `valueDate` / `valueNumber` / `valueInteger` / `valueTime` | Chosen from the field's type in `fields.json`. Date → ISO `YYYY-MM-DD`; number → numeric. Unparseable values fall back to `valueString` so nothing is lost. |
| `value[].boundingBoxes` (normalized 0–1 polygons) | `source: "D(page,x1,y1,…);D(…)"` (page **pixels**, or **inches** for PDFs) | One `D(…)` segment per box. See §4. |
| *(none)* | `spans: [{ offset, length }]` | Character grounding, threaded from OCR words. See §4. |
| `document`, `labelType` | *(dropped)* | Not part of the CUF schema. |
| *(none)* | `metadata.displayName/type/createdOn` | Document display name, MIME type, creation timestamp. |
| *(none)* | `metadata.fortraining` | `true`/`false`, set by the **Mark for training** switch. Also written to storage metadata (`PUT /files/:filename/metadata`). |

---

## 4. Grounding model (coordinates & spans)

CUF "grounds" every value two ways (per Microsoft docs — *source* = visual position, *spans* = logical position):

- **`source`** — `D(page, x1,y1, x2,y2, x3,y3, x4,y4)` polygons in **page pixels**.
  The toolkit stores boxes **normalized** to 0–1. Conversion uses the OCR page `width`/`height`:
  - write: `value = normalized × pageSize`, rounded to a whole number for pixel pages and to **four decimals** for PDFs, whose pages are measured in inches (a page is about 8.5 × 11, so whole numbers would snap every box to a one-inch grid)
  - read: `normalized = value ÷ pageSize`
  - the unit comes from the page size: a page narrower than 100 units is treated as inches
  Page dimensions come from the loaded OCR (`*.ocr.json` → `analyzeResult.pages[]`), falling back to reading the OCR file if needed.
- **`spans`** — `{ offset, length }` into the extracted content. These are **threaded from the OCR words**: each OCR word already carries a `span`, which is now attached to its canvas feature → carried into the selected candidate → saved on the label value → aggregated into `spans[]`.

**Frame note:** because OCR boxes are drawn against `*.ocr.json`, the generated `source` pixels are in the **`*.ocr.json` page frame**. This is internally consistent (the source matches the OCR the label was drawn on). When the toolkit's OCR source is the CUF `*.result.json` instead, `source` will be in CUF's own frame and match exactly.

---

## 5. Read behavior (compatibility)

- **Write:** always CUF format.
- **Read:** `parseLabelsFile()` detects the format. A file with `fieldLabels` is parsed as CUF; a legacy file with `labels[]` still loads unchanged, then **upgrades to CUF on the next save**.
  - This is a deliberate safety choice so the existing `Server/data` samples and any in-progress work keep loading. If you want **strict CUF-only reads** (legacy files stop loading), say so — it's a one-line change in `utils/cuf-labels/index.ts` (`parseLabelsFile`).
- Fields with **no `source`** (CUF "mapStatus": "skip", e.g. an ungrounded `VendorPhone`) are **skipped on read**, since there's no box to draw on the canvas.

---

## 6. Files changed

| File | Change |
| --- | --- |
| `Client/src/app/models/cuf-labels.ts` | **New.** CUF type definitions (`CufLabelsFile`, `CufFieldLabel`, `CufSpan`, `CufPageDim`). |
| `Client/src/app/utils/cuf-labels/index.ts` | **New.** The converter: `internalToCufLabels`, `cufToInternalLabels`, `parseLabelsFile`, `getPageDimsFromAnalyzeResult`, `guessMimeType`. |
| `Client/src/app/services/asset-service/custom-model-asset.service.ts` | Writes CUF (was legacy); reads via `parseLabelsFile`; injects the store to resolve fields/definitions/page-dims. |
| `Client/src/app/containers/custom-model-label-page/custom-model-label-page.component.ts` | `getAndSetLabels` now parses via the converter; added `getPageDimsForDocument`. |
| `Client/src/app/consts/constants.ts` | Added `cufLabelsSchema`; annotated the legacy `labelsSchema`. |
| `Client/src/app/models/custom-models.ts` | `LabelValue` / `LabelValueCandidate` gained optional `spans` (grounding). |
| `Client/src/app/utils/custom-model/index.ts` | `makeLabelValue` carries `spans` through. |
| `Client/src/app/services/ocr-layer.service.ts` | OCR word `span` attached to each canvas feature. |
| `Client/src/app/services/custom-model-label.service.ts` | `makeLabelValueCandidate` carries the word's `span`. |

**Server:** no change required. `Server/controllers/localFileStorageController.ts` is format-agnostic (it stores whatever bytes the client PUTs), so the format switch is entirely client-side.

---

## 7. Decisions & assumptions (please review)

1. **No fabricated `confidence` / `kind` / per-field `metadata` on write.** The toolkit produces human-authored ground-truth labels, not predictions, so it does not invent confidence scores. (Confidence belongs to the CUF analyzer output.) If you want predicted values preserved verbatim through an edit cycle, that's a follow-up.
2. **Dates default to DMY** (`20.09.2025` → `2025-09-20`) when the field format is unspecified, matching the European receipts in the samples. YMD/MDY are honored when the field format says so.
3. **Legacy-tolerant read** (see §5) — chosen over strict CUF-only to avoid silently dropping existing data.
4. **`fileId` is written as `""`** to match the CUF sample. (In Azure, this references the blob id — e.g. the original stored without an extension, like `c9205385-…`.)
5. **`source` is emitted in the OCR page-pixel frame** (see §4 frame note).

---

## 8. How it was verified

A round-trip test (`internal → CUF → internal`) was run against the **real sample data** — the legacy labels + OCR in `Server/data`, the toolkit `fields.json`, and the **actual CUF file in `cuf storage/`**. All 20 checks passed, including:

- scalar → `valueString` + `source D(…)`; `InvoiceDate` → ISO `valueDate`;
- `Items` flat keys → nested `valueArray`/`valueObject` with correct per-property types (`Quantity` → `number`);
- coordinate round-trip within rounding tolerance (< 0.001 normalized);
- parsing the real `cuf storage` file: `VendorName` text and normalized boxes recovered, `Items` exploded into `Items/<row>/<prop>`, ungrounded `VendorPhone` correctly skipped.

`ng build` passes.

---

## 9. Possible follow-ups (not in this change)

- Read the CUF `*.result.json` as the OCR source (so `source`/`spans` align byte-for-byte with CUF's content model).
- Display confidence from predicted CUF labels (the CU Studio-style per-field % shown in the reference screenshots).
- Preserve predicted `confidence`/`kind` through an edit for audit.
