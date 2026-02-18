import { CanvasState } from "./canvas/canvas.state";
import { CustomModelState } from "./custom-model/custom-model.state";
import { DocumentsState } from "./documents/documents.state";
import { PredictionsState } from "./predictions/predictions.state";
import { PortalState } from "./portal/portal.state";

export interface AppState {
    canvas: CanvasState;
    customModel: CustomModelState;
    documents: DocumentsState;
    predictions: PredictionsState;
    portal: PortalState;
}
