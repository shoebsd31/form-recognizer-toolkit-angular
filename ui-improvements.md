# Labeling UI — Review & Improvement Plan

**Reviewed:** 2026-10-02
**Context:** The existing Angular labeling UX (ported from Microsoft's Form Recognizer Toolkit) will be embedded inside a web application and wired to the **Content Understanding (CU)** framework's analyzer. The target workflow is: the analyzer returns **extraction + classification + generation** results, those surface in this UI, and users **correct** them by updating the labels.

This document captures an expert UI review of the screen in its current state and a prioritized plan to make it fit the Content Understanding review-and-correct workflow.

---

## 0. Changes already applied in this pass

| Change | File | Rationale |
| --- | --- | --- |
| Removed the **"Draw region"** button from the canvas command bar | `Client/src/app/containers/label-canvas/label-canvas.component.ts` | Requested removal; not part of the CU correction flow. (The `allowDrawRegion` input and draw handlers remain in code so the capability can be reinstated via config if ever needed.) |
| Removed the **"© Microsoft 2022"** footer | `Client/src/app/components/layout/layout.component.ts` | Requested removal; the toolkit is being white-labeled for embedding. `FooterComponent` is now unused and can be deleted in a follow-up. |

Both changes build cleanly (`ng build`).

---

## 1. Snapshot of the current screen

- **Shell:** page title "Document labels", a left document gallery (thumbnails), a resizable split between the **canvas** (center) and the **field pane** (right).
- **Canvas:** a photographed receipt (skewed, low-contrast) overlaid with dense, overlapping colored OCR/word boxes. Bottom bar has page control (`1 of 1`), zoom in/out, pan, rotate.
- **Field pane:** a flat list of fields, each a `●` color dot + name + extracted value + `✕` delete + drag handle + `⋮` overflow menu. A `+` adds fields. Example values visible: `InvoiceDate 20.09.2025`, `VendorName BILLA VOLLER LEBEN. Billa AG`, `InvoiceTotal EUR 45. 35 Zitronen`, several fields empty (`SubTotal`, `TotalTax`).

---

## 2. Key observations & issues

### 2.1 No notion of confidence or "needs review" (highest impact)
The screen treats every field identically. CU returns a **confidence score** per field, and the whole point of a human-in-the-loop review is to steer attention to low-confidence or likely-wrong values.
- `InvoiceTotal = "EUR 45. 35 Zitronen"` is visibly wrong (OCR has merged an item name into the total) yet is presented exactly like a correct field.
- Empty fields (`SubTotal`, `TotalTax`) look identical to populated ones — no "not found" vs "found" distinction.

**Impact:** reviewers must read every field manually; errors slip through. This is the single biggest gap for a review workflow.

### 2.2 Correction model is heavy
Today a value is corrected by selecting OCR words on the canvas and assigning them to a field. For a CU review pass, the common correction is simply **"the extracted text is right but the parse is wrong"** or **"fix one character."** There is no obvious **inline edit of the value** (type the corrected value directly), which makes small fixes slow.

### 2.3 No save / submit / approve affordance
There is no visible Save, Submit, or Approve control and no autosave/"last saved" indicator. A reviewer cannot tell whether their corrections are persisted or how to finalize the document.

### 2.4 Values are shown raw, not type-aware
- `EUR 45. 35` carries OCR spacing artifacts.
- `20.09.2025` is not normalized (no ISO/locale formatting), `11:42:05` time is untyped.
- Currency, date, number, and selection-mark fields all render as plain strings. CU exposes typed values + units; the UI should render and validate by type.

### 2.5 Field pane scannability
- The **color dot** is the only link between a field and its box on the canvas; with ~14+ fields the palette repeats and is hard to scan.
- Long lists have **no search/filter** and **no grouping** (e.g., by section, by status).
- The destructive **`✕` delete** sits inline on every row and is easy to mis-click; no visible undo.
- Empty fields are interleaved with populated ones, adding noise.

### 2.6 Canvas legibility
- The photographed receipt is skewed and low-contrast; boxes overlap heavily and are hard to read.
- Rotate exists, but there is **no auto-deskew, brightness/contrast, or crop** to make a phone-photo document reviewable.
- The command bar now holds only the layer filter and is visually unbalanced (empty left side).

### 2.7 Pane ↔ canvas linking is under-exploited
Hover linking exists in code (`setHoveredLabelName`), which is good. But **clicking a field** should scroll/zoom the canvas to that field's region (grounding), and selecting a region on the canvas should focus the matching field. Right now the association is mostly passive.

### 2.8 Accessibility
- Icon-only controls (zoom, pan, rotate, add, overflow) rely on `title`; confirm every one has an `aria-label`.
- Field→box association is **color-only**, which fails for color-blind users — pair the dot with a short label/number or shape.
- Verify focus order and keyboard operability across gallery → canvas → field pane.

### 2.9 Branding / theming for embedding
With the Microsoft footer removed, the look is still Fluent-styled with hard-coded hex colors (e.g., `#0078d4`, `#edebe9` in the canvas SCSS). For embedding, expose theme tokens (CSS custom properties) so the host app can match its own brand.

---

## 3. Content Understanding integration gaps

The current UI is built for **custom Form Recognizer labeling** (define `fields.json`, draw/assign regions, produce labels). CU's analyzer output and workflow differ. To make this screen a CU review surface:

### 3.1 Extraction
- Bind the field pane to the analyzer's **extracted fields** (value + type + **confidence** + **spans/grounding**), not to hand-authored labels.
- Surface confidence per field (see 2.1) and a **"confidence threshold"** control to auto-flag fields below it.
- Use grounding spans to drive click-to-region highlighting (see 2.7).

### 3.2 Classification
- There is **no UI for document classification** today. CU can classify a document (e.g., category/type). Add a header region showing the **predicted category + confidence** with a dropdown so the reviewer can **correct the class**.
- If routing to different field schemas per class, reflect the schema switch when the class changes.

### 3.3 Generation
- There is **no UI for generative/free-text fields** (summaries, rationales, generated answers). The current pane is strictly value-per-field. Add a field type that renders **multi-line generated text** that the reviewer can edit, ideally with the source spans it was grounded on.

### 3.4 Correction & persistence
- Define the **correction payload** back to the host/CU: edited value, corrected class, accept/reject, and (optionally) a re-grounded region.
- Add explicit **Approve / Reject / Save** per document, and a per-field **verified** state, so corrections become training/eval signal rather than silent edits.

---

## 4. Prioritized recommendations

### P0 — Required for a usable CU review workflow
1. **Confidence + status on every field:** show confidence, and visually flag "needs review", "not found", and "verified". Add a filter "show only low-confidence / unverified".
2. **Inline value editing:** let reviewers type the corrected value directly (type-aware input), in addition to region assignment.
3. **Save / Approve / Reject** actions with a clear persisted-state indicator; define the correction payload emitted to the host app.
4. **Classification panel:** show predicted document category + confidence with an editable control.

### P1 — Strong UX and correctness wins
5. **Click field → zoom/scroll to its grounded region**, and highlight bidirectionally.
6. **Type-aware rendering & validation** (date/currency/number/selection mark); normalize OCR artifacts.
7. **Field pane IA:** search/filter, group by status, collapse empty/low-value fields, de-emphasize/confirm the delete action, add undo.
8. **Generative-field UI** for CU generation output (editable multi-line, with source grounding).

### P2 — Polish, accessibility, embedding
9. **Image tooling:** auto-deskew, brightness/contrast, crop for photographed documents.
10. **Accessibility:** non-color field encoding, full `aria-label` coverage, keyboard-first correction (Tab between fields, Enter to edit/approve).
11. **Theming tokens** (CSS custom properties) so the embedding host can brand the UI.
12. **Rebalance the canvas command bar** now that "Draw region" is gone; the page title was renamed from "Label Page" to "Document labels"; the **Mark for training** switch sits above the canvas.

---

## 5. Suggested next step

Decide the **integration contract** first: the exact shape of the CU analyzer result the UI will consume (fields with confidence + spans, classification, generative fields) and the correction payload it will emit back. The P0 items (confidence/status, inline edit, save/approve, classification) all depend on that contract, so locking it down unblocks the rest.
