import { createFeatureSelector, createSelector } from "@ngrx/store";
import { PredictionsState } from "./predictions.state";

export const selectPredictionsState = createFeatureSelector<PredictionsState>("predictions");

export const selectPredictions = createSelector(
    selectPredictionsState,
    (state) => state.predictions
);
