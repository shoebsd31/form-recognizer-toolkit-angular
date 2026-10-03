/**
 * Type definitions for the Azure AI Content Understanding (CUF) `*.labels.json`
 * file format.
 *
 * Schema: https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json
 *
 * This is the on-disk format the toolkit now reads and writes, replacing the
 * legacy Form Recognizer `2021-03-01/labels.json` format. See
 * `utils/cuf-labels/index.ts` for the conversion to/from the toolkit's internal
 * `Label[]` model, and `CUF-LABELS-MIGRATION.md` for the full mapping.
 */

/** A span into the extracted text content (offset + length, in code points). */
export interface CufSpan {
    offset: number;
    length: number;
}

/**
 * A single field (or nested item/property) label in the CUF format.
 *
 * `valueString` / `valueDate` / `valueNumber` / `valueInteger` / `valueTime` /
 * `valueArray` / `valueObject` are mutually exclusive and chosen by `type`.
 *
 * `spans` + `source` are the "grounding": `spans` is the logical location
 * (character offset/length) and `source` is the visual location
 * (`D(page,x1,y1,...,x4,y4)` pixel polygons, one per `;`-separated segment).
 */
export interface CufFieldLabel {
    type: string; // string | date | number | integer | time | array | object | boolean
    valueString?: string;
    valueDate?: string;
    valueNumber?: number;
    valueInteger?: number;
    valueTime?: string;
    valueArray?: CufFieldLabel[];
    valueObject?: { [propertyName: string]: CufFieldLabel };
    spans?: CufSpan[];
    source?: string;

    // Prediction-only metadata. The toolkit produces human-authored (ground
    // truth) labels and does NOT fabricate these on write, but it preserves
    // whatever it reads so a predicted CUF file round-trips losslessly.
    confidence?: number;
    kind?: string;
    metadata?: { [key: string]: unknown };
}

/** The root object of a CUF `*.labels.json` file. */
export interface CufLabelsFile {
    $schema: string;
    fileId: string;
    fieldLabels: { [fieldName: string]: CufFieldLabel };
    metadata?: {
        displayName?: string;
        type?: string;
        createdOn?: string;
        [key: string]: unknown;
    };
}

/** Per-page pixel dimensions, needed to convert between normalized boxes and `source`. */
export interface CufPageDim {
    pageNumber: number;
    width: number;
    height: number;
}
