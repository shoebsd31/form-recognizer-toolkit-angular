import { createFeatureSelector, createSelector } from "@ngrx/store";
import { CanvasState } from "./canvas.state";

export const selectCanvasState = createFeatureSelector<CanvasState>("canvas");

export const selectCanvas = createSelector(selectCanvasState, (state) => state.canvas);
export const selectVisibleAnalyzedElement = createSelector(selectCanvasState, (state) => state.visibleAnalyzedElement);
export const selectHoveredBoundingBoxIds = createSelector(selectCanvasState, (state) => state.hoveredBoundingBoxIds);
export const selectHoveredLabelName = createSelector(selectCanvasState, (state) => state.hoveredLabelName);
export const selectDocumentSelectIndex = createSelector(selectCanvasState, (state) => state.documentSelectIndex);
export const selectShouldResizeImageMap = createSelector(selectCanvasState, (state) => state.shouldResizeImageMap);
