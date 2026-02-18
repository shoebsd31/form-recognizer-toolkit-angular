import { AnalyzeResponse } from "../../models/analyze-result";

export interface IPrediction {
    name: string;
    analyzeResponse: AnalyzeResponse;
}

export interface PredictionsState {
    predictions: { [name: string]: IPrediction };
}

export const initialPredictionsState: PredictionsState = {
    predictions: {},
};
