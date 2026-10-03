/**
 * Build the toolkit's field list (`fields` + `definitions`, the shape of
 * fields.json) from a Content Understanding analyzer definition
 * (`analyzer.json` -> `fieldSchema.fields`), so the labeling pane lists exactly
 * the fields the analyzer extracts instead of a separate, hand-kept fields.json.
 *
 * Mapping:
 *   string / classify enum         -> string
 *   date | time | number | integer -> same type
 *   array of objects               -> array field + `<Name>_object` definition
 *   object                         -> object field
 */

import { Definitions, Field, FieldFormat, FieldType, ObjectField } from "../../models/custom-models";

const toFieldType = (cuType?: string): FieldType => {
    switch (cuType) {
        case "date":
            return FieldType.Date;
        case "time":
            return FieldType.Time;
        case "number":
            return FieldType.Number;
        case "integer":
            return FieldType.Integer;
        case "object":
            return FieldType.Object;
        case "array":
            return FieldType.Array;
        default:
            return FieldType.String;
    }
};

const convertProps = (props: Record<string, any> = {}): Field[] =>
    Object.keys(props).map((name) => ({
        fieldKey: name,
        fieldType: toFieldType(props[name]?.type),
        fieldFormat: FieldFormat.NotSpecified,
    }));

/** Returns undefined when the analyzer has no usable `fieldSchema.fields`. */
export const analyzerToFields = (analyzer: any): { fields: Field[]; definitions: Definitions } | undefined => {
    // Accept a bare definition, or one wrapped as `{ analyzer: {...} }` / `{ result: {...} }`.
    const def = analyzer?.fieldSchema ? analyzer : analyzer?.analyzer ?? analyzer?.result;
    const schemaFields: Record<string, any> | undefined = def?.fieldSchema?.fields;
    if (!schemaFields || !Object.keys(schemaFields).length) return undefined;

    const fields: Field[] = [];
    const definitions: Definitions = {};

    for (const name of Object.keys(schemaFields)) {
        const f = schemaFields[name];
        const type = toFieldType(f?.type);
        if (type === FieldType.Array) {
            const itemType = `${name}_object`;
            definitions[itemType] = {
                fieldKey: itemType,
                fieldType: FieldType.Object,
                fieldFormat: FieldFormat.NotSpecified,
                fields: convertProps(f?.items?.properties),
            } as ObjectField;
            fields.push({ fieldKey: name, fieldType: FieldType.Array, itemType });
        } else if (type === FieldType.Object) {
            fields.push({
                fieldKey: name,
                fieldType: FieldType.Object,
                fieldFormat: FieldFormat.NotSpecified,
                fields: convertProps(f?.properties),
            } as ObjectField);
        } else {
            fields.push({ fieldKey: name, fieldType: type, fieldFormat: FieldFormat.NotSpecified });
        }
    }
    return { fields, definitions };
};
