import { createReducer, on } from "@ngrx/store";
import { LoadingOverlayWeights } from "../../consts/constants";
import { ILoadingOverlay, initialPortalState } from "./portal.state";
import * as PortalActions from "./portal.actions";

export const portalReducer = createReducer(
    initialPortalState,
    on(PortalActions.addLoadingOverlay, (state, { name, message, weight }) => {
        const addedOverlay: ILoadingOverlay = {
            name,
            message: message || "Loading...",
            weight: weight || LoadingOverlayWeights.Default,
        };
        const isOverlayExist = state.loadingOverlays.findIndex((overlay) => overlay.name === addedOverlay.name) !== -1;
        if (isOverlayExist) {
            return state;
        }
        return { ...state, loadingOverlays: [...state.loadingOverlays, addedOverlay] };
    }),
    on(PortalActions.removeLoadingOverlayByName, (state, { name }) => ({
        ...state,
        loadingOverlays: state.loadingOverlays.filter((overlay) => name !== overlay.name),
    }))
);
