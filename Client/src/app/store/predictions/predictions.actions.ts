import { createAction, props } from "@ngrx/store";
import { AnalyzeResponse } from "../../models/analyze-result";

export const setDocumentPrediction = createAction(
    "[Predictions] Set Document Prediction",
    props<{ name: string; analyzeResponse: AnalyzeResponse }>()
);

export const resetPredictions = createAction("[Predictions] Reset Predictions");
