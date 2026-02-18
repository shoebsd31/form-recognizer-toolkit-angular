export interface ICanvas {
    imageUrl: string;
    width: number;
    height: number;
    angle: number;
}

export enum VisibleAnalyzedElementEnum {
    KeyValuePairs = "KeyValuePairs",
    Entities = "Entities",
    PagedLabelResult = "PagedLabelResult",
    Lines = "Lines",
    Words = "Words",
    Paragraphs = "Paragraphs",
    SelectionMarks = "SelectionMarks",
    Tables = "Tables",
}

export type VisibleAnalyzedElement = {
    [VisibleAnalyzedElementEnum.KeyValuePairs]?: boolean;
    [VisibleAnalyzedElementEnum.Entities]?: boolean;
    [VisibleAnalyzedElementEnum.PagedLabelResult]?: boolean;
    [VisibleAnalyzedElementEnum.Lines]?: boolean;
    [VisibleAnalyzedElementEnum.Words]: boolean;
    [VisibleAnalyzedElementEnum.Paragraphs]?: boolean;
    [VisibleAnalyzedElementEnum.Tables]?: boolean;
    [VisibleAnalyzedElementEnum.SelectionMarks]?: boolean;
};

export interface CanvasState {
    canvas: ICanvas;
    visibleAnalyzedElement: VisibleAnalyzedElement;
    hoveredBoundingBoxIds: string[];
    hoveredLabelName: string;
    documentSelectIndex: number;
    shouldResizeImageMap: boolean;
}

export const initialCanvasState: CanvasState = {
    canvas: { imageUrl: "", width: 0, height: 0, angle: 0 },
    documentSelectIndex: 0,
    visibleAnalyzedElement: { [VisibleAnalyzedElementEnum.Words]: true },
    hoveredBoundingBoxIds: [],
    hoveredLabelName: "",
    shouldResizeImageMap: false,
};
