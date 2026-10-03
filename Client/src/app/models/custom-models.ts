import { FeatureCategory } from "../components/image-map/contracts";
import { Polygon } from "./analyze-result";
import { CufSpan } from "./cuf-labels";

export type CustomModel = {
    modelId: string;
    description: string;
    createdDateTime: string;
    apiVersion?: string;
    tags?: {
        modelType?: string;
        [key: string]: string | undefined;
    };
};

export type PrimitiveField = {
    fieldKey: string;
    fieldType: FieldType;
    fieldFormat: FieldFormat;
};

export type ObjectField = {
    fieldKey: string;
    fieldType: FieldType;
    fields: Field[];
    fieldFormat: FieldFormat;
    visualizationHint?: VisualizationHint;
};

export type ArrayField = {
    fieldKey: string;
    fieldType: FieldType;
    itemType: string;
    visualizationHint?: VisualizationHint;
};

export type Field = PrimitiveField | ObjectField | ArrayField;

export type FieldsWithOrder = Field & { order: number };

export enum FieldType {
    String = "string",
    Number = "number",
    Date = "date",
    Time = "time",
    Integer = "integer",
    SelectionMark = "selectionMark",
    Signature = "signature",
    Array = "array",
    Object = "object",
}

export enum FieldFormat {
    NotSpecified = "not-specified",
    Currency = "currency",
    Decimal = "decimal",
    DecimalCommaSeparated = "decimal-comma-separated",
    NoWhiteSpaces = "no-white-spaces",
    Alphanumeric = "alphanumeric",
    DMY = "dmy",
    MDY = "mdy",
    YMD = "ymd",
}

export enum VisualizationHint {
    Horizontal = "horizontal",
    Vertical = "vertical",
}

export type Labels = {
    [documentName: string]: Label[];
};

export type Label = {
    label: string;
    value: LabelValue[];
    labelType?: LabelType;
};

export type LabelValue = {
    boundingBoxes: Polygon[];
    page: number;
    text: string;
    // CUF grounding: character spans into the extracted content, carried through
    // from OCR words so they can be written to the CUF `*.labels.json` file.
    spans?: CufSpan[];
    // Analyzer confidence (0..1) from the Content Understanding result, display only.
    confidence?: number;
};

export type LabelValueCandidate = {
    boundingBoxes: Polygon[];
    page: number;
    text: string;
    category: FeatureCategory;
    alreadyAssignedLabelName?: string;
    // CUF grounding span of the selected OCR word (when the candidate came from one).
    spans?: CufSpan[];
};

export enum LabelType {
    Words = "words",
    Region = "region",
}

export type Definitions = {
    [objectName: string]: ObjectField;
};

export enum TableType {
    dynamic = "dynamic",
    fixed = "fixed",
}

export enum HeaderType {
    row = "row",
    column = "column",
}
