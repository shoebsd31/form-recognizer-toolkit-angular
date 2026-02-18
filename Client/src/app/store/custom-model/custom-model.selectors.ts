import { createFeatureSelector, createSelector } from "@ngrx/store";
import { CustomModelState } from "./custom-model.state";

export const selectCustomModelState = createFeatureSelector<CustomModelState>("customModel");

export const selectDefinitions = createSelector(selectCustomModelState, (state) => state.definitions);
export const selectFields = createSelector(selectCustomModelState, (state) => state.fields);
export const selectColorForFields = createSelector(selectCustomModelState, (state) => state.colorForFields);
export const selectLabels = createSelector(selectCustomModelState, (state) => state.labels);
export const selectOrders = createSelector(selectCustomModelState, (state) => state.orders);
export const selectLabelValueCandidates = createSelector(selectCustomModelState, (state) => state.labelValueCandidates);
export const selectLabelError = createSelector(selectCustomModelState, (state) => state.labelError);
export const selectHideInlineLabelMenu = createSelector(selectCustomModelState, (state) => state.hideInlineLabelMenu);
