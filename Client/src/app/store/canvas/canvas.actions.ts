import { createAction, props } from "@ngrx/store";
import { ICanvas, VisibleAnalyzedElementEnum } from "./canvas.state";

export const setAngle = createAction("[Canvas] Set Angle", props<{ angle: number }>());

export const setVisibleAnalyzedElement = createAction(
    "[Canvas] Set Visible Analyzed Element",
    props<{ element: VisibleAnalyzedElementEnum; value: boolean }>()
);

export const setHoveredBoundingBoxIds = createAction(
    "[Canvas] Set Hovered Bounding Box Ids",
    props<{ ids: string[] }>()
);

export const setHoveredLabelName = createAction(
    "[Canvas] Set Hovered Label Name",
    props<{ name: string }>()
);

export const setDocumentSelectIndex = createAction(
    "[Canvas] Set Document Select Index",
    props<{ index: number }>()
);

export const setShouldResizeImageMap = createAction(
    "[Canvas] Set Should Resize Image Map",
    props<{ shouldResize: boolean }>()
);

export const resetCanvas = createAction("[Canvas] Reset Canvas");

export const setCanvas = createAction("[Canvas] Set Canvas", props<{ canvas: ICanvas }>());
