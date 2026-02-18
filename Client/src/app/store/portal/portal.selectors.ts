import { createFeatureSelector, createSelector } from "@ngrx/store";
import { PortalState } from "./portal.state";

export const selectPortalState = createFeatureSelector<PortalState>("portal");

export const selectLoadingOverlays = createSelector(
    selectPortalState,
    (state) => state.loadingOverlays
);
