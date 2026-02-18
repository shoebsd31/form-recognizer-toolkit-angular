import { createReducer, on } from "@ngrx/store";
import { initialCanvasState } from "./canvas.state";
import * as CanvasActions from "./canvas.actions";
import * as DocumentsActions from "../documents/documents.actions";

export const canvasReducer = createReducer(
    initialCanvasState,
    on(CanvasActions.setAngle, (state, { angle }) => ({
        ...state,
        canvas: { ...state.canvas, angle },
    })),
    on(CanvasActions.setVisibleAnalyzedElement, (state, { element, value }) => ({
        ...state,
        visibleAnalyzedElement: { ...state.visibleAnalyzedElement, [element]: value },
    })),
    on(CanvasActions.setHoveredBoundingBoxIds, (state, { ids }) => ({
        ...state,
        hoveredBoundingBoxIds: ids,
    })),
    on(CanvasActions.setHoveredLabelName, (state, { name }) => ({
        ...state,
        hoveredLabelName: name,
    })),
    on(CanvasActions.setDocumentSelectIndex, (state, { index }) => ({
        ...state,
        documentSelectIndex: index,
    })),
    on(CanvasActions.setShouldResizeImageMap, (state, { shouldResize }) => ({
        ...state,
        shouldResizeImageMap: shouldResize,
    })),
    on(CanvasActions.resetCanvas, (state) => ({
        ...state,
        canvas: { imageUrl: "", width: 0, height: 0, angle: 0 },
        hoveredBoundingBoxIds: [],
        hoveredLabelName: "",
        documentSelectIndex: 0,
    })),
    on(CanvasActions.setCanvas, (state, { canvas }) => ({
        ...state,
        canvas,
        hoveredBoundingBoxIds: [],
        hoveredLabelName: "",
        documentSelectIndex: 0,
    })),
    on(DocumentsActions.clearCurrentDocument, (state) => ({
        ...state,
        canvas: { imageUrl: "", width: 0, height: 0, angle: 0 },
        hoveredBoundingBoxIds: [],
        hoveredLabelName: "",
        documentSelectIndex: 0,
    })),
    on(DocumentsActions.setCurrentDocumentSuccess, (state, { documentPage }) => ({
        ...state,
        canvas: documentPage,
        hoveredBoundingBoxIds: [],
        hoveredLabelName: "",
        documentSelectIndex: 0,
    })),
    on(DocumentsActions.setCurrentPageSuccess, (state, { documentPage }) => ({
        ...state,
        canvas: documentPage,
        hoveredBoundingBoxIds: [],
        hoveredLabelName: "",
    }))
);
