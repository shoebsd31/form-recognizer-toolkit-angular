export const constants = {
    defaultSplitPaneSizes: {
        analyzeSplitPaneSize: [70, 30],
        labelSplitPaneSize: [80, 20],
        labelTableSplitPaneSize: [65, 35],
    },
    dynamicTableImgSrc: "assets/images/customModels/dynamic-table.png",
    fixedTableImgSrc: "assets/images/customModels/fixed-table.png",
    fieldsSchema: "https://schema.cognitiveservices.azure.com/formrecognizer/2021-03-01/fields.json",
    // Legacy Form Recognizer labels schema (kept only for reference / tolerant reads).
    labelsSchema: "https://schema.cognitiveservices.azure.com/formrecognizer/2021-03-01/labels.json",
    // Azure AI Content Understanding labels schema — the format the toolkit now writes.
    cufLabelsSchema: "https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json",
    fieldsFile: "fields.json",
    // CU analyzer definition; when present it drives the field list instead of fields.json.
    analyzerFile: "analyzer.json",
    labelFileExtension: ".labels.json",
    ocrFileExtension: ".ocr.json",
    // Content Understanding analyzer output; the OCR word overlay is now drawn from this.
    resultFileExtension: ".result.json",
};

export enum LoadingOverlayWeights {
    ExtraLight = 0,
    Light = 10,
    Default = 20,
    SemiHeavy = 30,
    Heavy = 40,
    ExtraHeavy = 50,
}

export enum KeyEventType {
    KeyDown = "keydown",
    KeyUp = "keyup",
}

export enum KeyEventCode {
    Shift = "Shift",
    Escape = "Escape",
}
