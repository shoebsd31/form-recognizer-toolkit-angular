/**
 * Convert a Content Understanding `*.result.json` (analyzer output) into a CUF
 * `*.labels.json`, matching the format of the reference files in `cuf storage/`
 * and the toolkit's own labels schema
 * (https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json).
 *
 * Mapping (see cuf storage/*.labels.json):
 *   field -> { type, value<Type>, spans[], confidence, source, kind, metadata{ mapStatus, content } }
 *     - grounded field (value + source) -> mapStatus "succeed", kind "predicted"
 *     - ungrounded field (no value)     -> mapStatus "skip" (no value/spans/source)
 *     - array (e.g. Items)              -> kind "predicted", metadata.mapStatus "skip",
 *                                          valueArray[] of objects -> valueObject{ prop: ... }
 *   `source` pixel polygons are rounded to integers, as the reference files store them.
 *
 * The optional field schema (from the analyzer definition) fixes the field order
 * and ensures schema fields missing from the result are still emitted as "skip".
 * Without it, fields are taken from the result in their existing order.
 */

const CUF_LABELS_SCHEMA = "https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json";

/** A field definition from an analyzer `fieldSchema` (only the parts we use). */
export interface CufFieldDef {
    type?: string;
    items?: { properties?: Record<string, CufFieldDef> };
    properties?: Record<string, CufFieldDef>;
}
export interface CufFieldSchema {
    fields?: Record<string, CufFieldDef>;
}

const VALUE_KEYS = [
    "valueString",
    "valueDate",
    "valueNumber",
    "valueInteger",
    "valueTime",
    "valueBoolean",
    "valueArray",
    "valueObject",
] as const;

/** Round the pixel coordinates in a `D(page,x1,y1,...)` source string to integers. */
const roundSource = (src?: string): string | undefined => {
    if (!src) return undefined;
    const segs = src
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((seg) => {
            const m = seg.match(/^D\(([^)]*)\)$/);
            if (!m) return seg;
            const parts = m[1].split(",").map((p) => p.trim());
            const [page, ...nums] = parts;
            const ints = nums.map((n) => String(Math.round(parseFloat(n))));
            return `D(${[page, ...ints].join(",")})`;
        });
    return segs.length ? segs.join(";") : undefined;
};

/** Human-readable text of a field value, for `metadata.content`. */
const displayText = (rf: any): string | undefined => {
    if (rf.valueString !== undefined) return rf.valueString;
    if (rf.valueDate !== undefined) return rf.valueDate;
    if (rf.valueTime !== undefined) return rf.valueTime;
    if (rf.valueNumber !== undefined) return String(rf.valueNumber);
    if (rf.valueInteger !== undefined) return String(rf.valueInteger);
    return undefined;
};

/** Convert one scalar result field into a CUF label field. */
const convertScalar = (rf: any, declaredType = "string"): any => {
    const out: any = { type: rf.type || declaredType };
    const valKey = VALUE_KEYS.find((k) => rf[k] !== undefined);
    if (valKey) out[valKey] = rf[valKey];
    if (Array.isArray(rf.spans) && rf.spans.length) out.spans = rf.spans;
    if (rf.confidence !== undefined) out.confidence = rf.confidence;
    const src = roundSource(rf.source);
    if (src) out.source = src;
    out.kind = "predicted";
    out.metadata = valKey && src ? { mapStatus: "succeed", content: displayText(rf) } : { mapStatus: "skip" };
    return out;
};

/** Convert an array (table) result field into a CUF label field. */
const convertArray = (rf: any, itemProps?: Record<string, CufFieldDef>): any => {
    const out: any = { type: "array", kind: "predicted", metadata: { mapStatus: "skip" }, valueArray: [] as any[] };
    for (const row of rf?.valueArray || []) {
        const rowObj = row?.valueObject || {};
        // Prefer the analyzer-declared property order; fall back to the row's own keys.
        const propOrder = itemProps ? Object.keys(itemProps) : Object.keys(rowObj);
        const valueObject: Record<string, any> = {};
        for (const prop of propOrder) {
            if (rowObj[prop] !== undefined) {
                valueObject[prop] = convertScalar(rowObj[prop], itemProps?.[prop]?.type || "string");
            }
        }
        out.valueArray.push({ type: "object", kind: "predicted", metadata: { mapStatus: "skip" }, valueObject });
    }
    return out;
};

export interface ResultToLabelsOptions {
    fieldSchema?: CufFieldSchema; // analyzer field schema (for order + skipped fields)
    displayName?: string;
    mimeType?: string;
}

/** Build a CUF labels file object from a parsed `*.result.json`. */
export const resultToCufLabels = (resultJson: any, opts: ResultToLabelsOptions = {}): any => {
    const r = resultJson?.result ?? resultJson; // tolerate wrapped or bare result
    const content = (r?.contents && r.contents[0]) || {};
    const rfields: Record<string, any> = content.fields || {};

    const schemaFields = opts.fieldSchema?.fields;
    const itemProps = schemaFields?.["Items"]?.items?.properties;
    // Field order: analyzer schema when provided, else the result's own fields.
    const fieldNames = schemaFields ? Object.keys(schemaFields) : Object.keys(rfields);

    const fieldLabels: Record<string, any> = {};
    for (const name of fieldNames) {
        const declaredType = schemaFields?.[name]?.type || rfields[name]?.type || "string";
        const rf = rfields[name];
        if (declaredType === "array") {
            const props = schemaFields?.[name]?.items?.properties || itemProps;
            fieldLabels[name] = convertArray(rf || {}, props);
        } else if (rf === undefined) {
            // Schema field absent from the result -> emit as skipped.
            fieldLabels[name] = { type: declaredType, kind: "predicted", metadata: { mapStatus: "skip" } };
        } else {
            fieldLabels[name] = convertScalar(rf, declaredType);
        }
    }

    return {
        $schema: CUF_LABELS_SCHEMA,
        fileId: "",
        fieldLabels,
        metadata: {
            displayName: opts.displayName,
            type: opts.mimeType || "image/jpeg",
            createdOn: Date.now().toString(),
        },
    };
};
