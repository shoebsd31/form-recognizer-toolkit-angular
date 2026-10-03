/**
 * Conversion between the toolkit's internal `Label[]` model and the Azure AI
 * Content Understanding (CUF) `*.labels.json` file format.
 *
 * WHY: The toolkit now reads and writes the CUF labels schema
 * (`https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json`) so that
 * labels produced here can be reused directly by Content Understanding. The
 * internal store model and the whole UI stay unchanged — conversion happens
 * only at the file (de)serialization boundary.
 *
 * KEY DIFFERENCES between the two formats (see CUF-LABELS-MIGRATION.md):
 *   Legacy (FR 2021-03-01)        CUF (2024-12-01-preview)
 *   --------------------------    -----------------------------------------
 *   labels: [{ label, value }]    fieldLabels: { <FieldName>: {...} }
 *   value[].boundingBoxes         source: "D(page,x1,y1,...);D(...)" (pixels)
 *     (normalized 0..1 polygons)    one D(...) polygon per word, in page pixels
 *   value[].text                  valueString / valueDate / valueNumber / ...
 *   (no span info)                spans: [{ offset, length }]
 *   "Items/0/Amount" flat keys    Items.valueArray[0].valueObject.Amount (nested)
 *
 * GROUNDING: CUF `source` is in page PIXELS, so converting to/from the internal
 * normalized (0..1) boxes needs the OCR page width/height (`CufPageDim`).
 */

import {
    ArrayField,
    Definitions,
    Field,
    FieldFormat,
    FieldType,
    Label,
    LabelValue,
    ObjectField,
} from "../../models/custom-models";
import { CufFieldLabel, CufLabelsFile, CufPageDim, CufSpan } from "../../models/cuf-labels";
import { constants } from "../../consts/constants";

// ---------------------------------------------------------------------------
// Label-key encoding (kept local so this module stays free of Angular deps and
// is unit-testable in isolation). These mirror the helpers in utils/custom-model.
//   "/" in a field name is escaped as "~1" and "~" as "~0".
// ---------------------------------------------------------------------------

const decodeLabelString = (label: string): string => label.replace(/~1/g, "/").replace(/~0/g, "~");

const encodeLabelString = (label: string): string => label.replace(/~/g, "~0").replace(/\//g, "~1");

/** Top-level field key for an internal label ("Items/0/Amount" -> "Items"). */
const getFieldKeyFromLabel = (label: Label): string => decodeLabelString(label.label.split("/")[0]);

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/** Map a toolkit field type to a CUF value type. */
const toCufType = (fieldType: FieldType): string => {
    switch (fieldType) {
        case FieldType.Date:
            return "date";
        case FieldType.Time:
            return "time";
        case FieldType.Number:
            return "number";
        case FieldType.Integer:
            return "integer";
        case FieldType.Array:
            return "array";
        case FieldType.Object:
            return "object";
        // SelectionMark / Signature are grounded regions; their value is kept as text.
        case FieldType.SelectionMark:
        case FieldType.Signature:
        case FieldType.String:
        default:
            return "string";
    }
};

// ---------------------------------------------------------------------------
// Value (text) helpers
// ---------------------------------------------------------------------------

/** Best-effort date normalization to ISO (YYYY-MM-DD). Returns undefined if unparseable. */
const normalizeDate = (raw: string, format?: FieldFormat): string | undefined => {
    const t = (raw || "").trim();
    if (!t) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})$/);
    if (!m) return undefined;
    let [, a, b, c] = m;
    let year: string;
    let month: string;
    let day: string;
    if (a.length === 4) {
        // YMD
        year = a;
        month = b;
        day = c;
    } else if (format === FieldFormat.MDY) {
        month = a;
        day = b;
        year = c;
    } else {
        // DMY is the default for receipts when unspecified.
        day = a;
        month = b;
        year = c;
    }
    if (year.length === 2) year = "20" + year;
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return undefined;
    return `${year}-${mm}-${dd}`;
};

/** Best-effort numeric parse that understands comma decimals ("1,90" -> 1.9). */
const parseNumber = (raw: string): number | undefined => {
    const t = (raw || "").trim();
    if (!t) return undefined;
    let s = t.replace(/\s/g, "");
    if (/^-?\d+,\d+$/.test(s)) {
        s = s.replace(",", ".");
    } else {
        s = s.replace(/,/g, ""); // treat remaining commas as thousands separators
    }
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
};

/** Write the correct typed value onto a CUF field label; falls back to valueString. */
const assignTypedValue = (
    target: CufFieldLabel,
    cufType: string,
    text: string,
    fieldFormat?: FieldFormat
): void => {
    const t = (text ?? "").trim();
    switch (cufType) {
        case "date": {
            const iso = normalizeDate(t, fieldFormat);
            if (iso) target.valueDate = iso;
            else target.valueString = t; // keep the raw text so nothing is lost
            break;
        }
        case "number": {
            const n = parseNumber(t);
            if (n !== undefined) target.valueNumber = n;
            else target.valueString = t;
            break;
        }
        case "integer": {
            const n = parseNumber(t);
            if (n !== undefined) target.valueInteger = Math.trunc(n);
            else target.valueString = t;
            break;
        }
        case "time":
            target.valueTime = t;
            break;
        default:
            target.valueString = t;
    }
};

/** Read whatever typed value a CUF field label carries, as plain display text. */
const extractText = (cl: CufFieldLabel): string => {
    if (cl.valueString !== undefined) return cl.valueString;
    if (cl.valueDate !== undefined) return cl.valueDate;
    if (cl.valueTime !== undefined) return cl.valueTime;
    if (cl.valueNumber !== undefined) return String(cl.valueNumber);
    if (cl.valueInteger !== undefined) return String(cl.valueInteger);
    return "";
};

// ---------------------------------------------------------------------------
// Grounding helpers: source (pixels) <-> boundingBoxes (normalized 0..1)
// ---------------------------------------------------------------------------

/** One normalized polygon -> a `D(page,x1,y1,...)` pixel source segment. */
const polygonToSource = (polygon: number[], page: number, width: number, height: number): string => {
    const nums: number[] = [];
    for (let i = 0; i < polygon.length; i += 2) {
        nums.push(Math.round(polygon[i] * width));
        nums.push(Math.round(polygon[i + 1] * height));
    }
    return `D(${page},${nums.join(",")})`;
};

/** Build the `;`-joined `source` string for all boxes across a field's values. */
const buildSource = (values: LabelValue[], pageDims: CufPageDim[]): string | undefined => {
    const parts: string[] = [];
    for (const v of values) {
        const dim = pageDims.find((d) => d.pageNumber === v.page);
        if (!dim) continue;
        for (const bb of v.boundingBoxes || []) {
            parts.push(polygonToSource(bb as unknown as number[], v.page, dim.width, dim.height));
        }
    }
    return parts.length ? parts.join(";") : undefined;
};

/** Parse a `source` string back into a page number + normalized (0..1) polygons. */
const parseSource = (
    source: string,
    pageDims: CufPageDim[]
): { page: number; boundingBoxes: number[][] } => {
    const boundingBoxes: number[][] = [];
    let page = 1;
    const segments = source.split(";").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
        const m = seg.match(/^D\(([^)]*)\)$/);
        if (!m) continue;
        const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
        if (parts.length < 3) continue;
        page = parts[0] || 1;
        const dim = pageDims.find((d) => d.pageNumber === page);
        const coords = parts.slice(1);
        const normalized: number[] = [];
        for (let i = 0; i < coords.length; i += 2) {
            normalized.push(dim ? coords[i] / dim.width : coords[i]);
            normalized.push(dim ? coords[i + 1] / dim.height : coords[i + 1]);
        }
        boundingBoxes.push(normalized);
    }
    return { page, boundingBoxes };
};

/** Collect all spans across a field's values. */
const collectSpans = (values: LabelValue[]): CufSpan[] | undefined => {
    const spans: CufSpan[] = [];
    for (const v of values) {
        if (v.spans) spans.push(...v.spans);
    }
    return spans.length ? spans : undefined;
};

// ---------------------------------------------------------------------------
// Internal Label[] -> CUF fieldLabels
// ---------------------------------------------------------------------------

/** Build a scalar CUF field label from a set of internal label values. */
const buildCufScalar = (
    cufType: string,
    values: LabelValue[],
    pageDims: CufPageDim[],
    fieldFormat?: FieldFormat
): CufFieldLabel => {
    const text = values
        .map((v) => v.text)
        .filter((t) => t !== undefined && t !== null && t !== "")
        .join(" ")
        .trim();
    const label: CufFieldLabel = { type: cufType };
    assignTypedValue(label, cufType, text, fieldFormat);
    const spans = collectSpans(values);
    if (spans) label.spans = spans;
    const source = buildSource(values, pageDims);
    if (source) label.source = source;
    return label;
};

/** Build the nested `valueArray` for an array (table) field from flat `Field/row/prop` labels. */
const buildCufArray = (
    field: ArrayField,
    labels: Label[],
    definitions: Definitions,
    pageDims: CufPageDim[]
): CufFieldLabel => {
    const itemDef = definitions[field.itemType] as ObjectField | undefined;
    const propType = new Map<string, FieldType>();
    (itemDef?.fields || []).forEach((f) => propType.set(f.fieldKey, f.fieldType));

    const rows = new Map<number, Label[]>();
    for (const lab of labels) {
        const parts = lab.label.split("/");
        const rowIdx = parseInt(parts[1], 10);
        if (isNaN(rowIdx)) continue;
        if (!rows.has(rowIdx)) rows.set(rowIdx, []);
        rows.get(rowIdx)!.push(lab);
    }

    const valueArray: CufFieldLabel[] = Array.from(rows.keys())
        .sort((a, b) => a - b)
        .map((rowIdx) => {
            const valueObject: { [k: string]: CufFieldLabel } = {};
            for (const lab of rows.get(rowIdx)!) {
                const parts = lab.label.split("/");
                const prop = decodeLabelString(parts.slice(2).join("/"));
                const cufType = toCufType(propType.get(prop) ?? FieldType.String);
                valueObject[prop] = buildCufScalar(cufType, lab.value, pageDims);
            }
            return { type: "object", valueObject } as CufFieldLabel;
        });

    return { type: "array", valueArray };
};

/** Build a `valueObject` for a top-level object field from flat `Field/prop` labels. */
const buildCufObject = (
    field: ObjectField,
    labels: Label[],
    pageDims: CufPageDim[]
): CufFieldLabel => {
    const propType = new Map<string, FieldType>();
    (field.fields || []).forEach((f) => propType.set(f.fieldKey, f.fieldType));
    const valueObject: { [k: string]: CufFieldLabel } = {};
    for (const lab of labels) {
        const parts = lab.label.split("/");
        const prop = decodeLabelString(parts.slice(1).join("/"));
        if (!prop) continue;
        const cufType = toCufType(propType.get(prop) ?? FieldType.String);
        valueObject[prop] = buildCufScalar(cufType, lab.value, pageDims);
    }
    return { type: "object", valueObject };
};

export interface InternalToCufParams {
    documentName: string;
    mimeType: string;
    labels: Label[];
    fields: Field[];
    definitions: Definitions;
    pageDims: CufPageDim[];
}

/** Convert the toolkit's internal labels for one document into a CUF labels file. */
export const internalToCufLabels = (params: InternalToCufParams): CufLabelsFile => {
    const { documentName, mimeType, labels, fields, definitions, pageDims } = params;
    const fieldByKey = new Map<string, Field>(fields.map((f) => [f.fieldKey, f]));
    const fieldLabels: { [k: string]: CufFieldLabel } = {};

    const byField = new Map<string, Label[]>();
    for (const lab of labels) {
        const key = getFieldKeyFromLabel(lab);
        if (!byField.has(key)) byField.set(key, []);
        byField.get(key)!.push(lab);
    }

    for (const [fieldKey, fieldLabs] of byField) {
        const field = fieldByKey.get(fieldKey);
        if (field && field.fieldType === FieldType.Array) {
            fieldLabels[fieldKey] = buildCufArray(field as ArrayField, fieldLabs, definitions, pageDims);
        } else if (field && field.fieldType === FieldType.Object) {
            fieldLabels[fieldKey] = buildCufObject(field as ObjectField, fieldLabs, pageDims);
        } else {
            const scalar = fieldLabs.find((l) => decodeLabelString(l.label) === fieldKey) || fieldLabs[0];
            const cufType = field ? toCufType(field.fieldType) : "string";
            fieldLabels[fieldKey] = buildCufScalar(
                cufType,
                scalar.value,
                pageDims,
                (field as any)?.fieldFormat
            );
        }
    }

    return {
        $schema: constants.cufLabelsSchema,
        fileId: "",
        fieldLabels,
        metadata: {
            displayName: documentName,
            type: mimeType,
            createdOn: Date.now().toString(),
        },
    };
};

// ---------------------------------------------------------------------------
// CUF fieldLabels -> internal Label[]
// ---------------------------------------------------------------------------

/**
 * Turn one CUF field label into a single internal LabelValue carrying ALL of
 * its grounding boxes + the full text. (The toolkit draws one box per polygon,
 * all tagged with the same field text, which matches CUF's aggregated model.)
 * Returns undefined when there is no `source` (ungrounded/"skip" fields can't
 * be drawn on the canvas).
 */
const cufFieldToValue = (cl: CufFieldLabel, pageDims: CufPageDim[]): LabelValue | undefined => {
    if (!cl.source) return undefined;
    const { page, boundingBoxes } = parseSource(cl.source, pageDims);
    if (!boundingBoxes.length) return undefined;
    const value: LabelValue = {
        text: extractText(cl),
        page,
        boundingBoxes: boundingBoxes as any,
    };
    if (cl.spans && cl.spans.length) value.spans = cl.spans;
    return value;
};

/** Convert a CUF labels file into the toolkit's internal labels. */
export const cufToInternalLabels = (cufFile: CufLabelsFile, pageDims: CufPageDim[]): Label[] => {
    const out: Label[] = [];
    const fieldLabels = cufFile.fieldLabels || {};
    for (const fieldName of Object.keys(fieldLabels)) {
        const cl = fieldLabels[fieldName];
        const encName = encodeLabelString(fieldName);
        if (cl.type === "array" && Array.isArray(cl.valueArray)) {
            cl.valueArray.forEach((row, rowIdx) => {
                const vo = row.valueObject || {};
                for (const prop of Object.keys(vo)) {
                    const value = cufFieldToValue(vo[prop], pageDims);
                    if (value) {
                        out.push({ label: `${encName}/${rowIdx}/${encodeLabelString(prop)}`, value: [value] });
                    }
                }
            });
        } else if (cl.type === "object" && cl.valueObject) {
            for (const prop of Object.keys(cl.valueObject)) {
                const value = cufFieldToValue(cl.valueObject[prop], pageDims);
                if (value) {
                    out.push({ label: `${encName}/${encodeLabelString(prop)}`, value: [value] });
                }
            }
        } else {
            const value = cufFieldToValue(cl, pageDims);
            if (value) out.push({ label: encName, value: [value] });
        }
    }
    return out;
};

// ---------------------------------------------------------------------------
// File-level helpers (legacy tolerant read)
// ---------------------------------------------------------------------------

/** True if a parsed labels file is in the CUF format. */
export const isCufLabelsFile = (parsed: any): boolean =>
    !!parsed && typeof parsed === "object" && !!parsed.fieldLabels;

/**
 * Parse a `*.labels.json` file (raw string) into internal labels.
 * Accepts both CUF (`fieldLabels`) and legacy FR (`labels[]`) files so existing
 * data keeps loading; the next save re-writes it in CUF format.
 */
export const parseLabelsFile = (raw: string, pageDims: CufPageDim[]): Label[] => {
    const parsed = JSON.parse(raw);
    if (isCufLabelsFile(parsed)) return cufToInternalLabels(parsed, pageDims);
    return (parsed && parsed.labels) || []; // legacy Form Recognizer format
};

/** Extract per-page pixel dimensions from an OCR/analyze result. */
export const getPageDimsFromAnalyzeResult = (analyzeResult: any): CufPageDim[] => {
    // FR layout exposes pages at the top; Content Understanding nests them under
    // `contents[].pages`. Support both so page dims resolve for either source.
    const pages =
        analyzeResult?.pages ||
        (analyzeResult?.contents || []).flatMap((c: any) => c?.pages || []) ||
        [];
    return pages.map((p: any) => ({ pageNumber: p.pageNumber, width: p.width, height: p.height }));
};

/** Guess the MIME type for the CUF `metadata.type` from a filename. */
export const guessMimeType = (filename: string): string => {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    switch (ext) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "bmp":
            return "image/bmp";
        case "tif":
        case "tiff":
            return "image/tiff";
        case "pdf":
            return "application/pdf";
        default:
            return "application/octet-stream";
    }
};
