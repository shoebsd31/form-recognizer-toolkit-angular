import { createReducer, on } from "@ngrx/store";
import { initialPredictionsState } from "./predictions.state";
import * as PredictionsActions from "./predictions.actions";

export const predictionsReducer = createReducer(
    initialPredictionsState,
    on(PredictionsActions.setDocumentPrediction, (state, { name, analyzeResponse }) => ({
        ...state,
        predictions: { ...state.predictions, [name]: { name, analyzeResponse } },
    })),
    on(PredictionsActions.resetPredictions, (state) => ({
        ...state,
        predictions: {},
    }))
);
