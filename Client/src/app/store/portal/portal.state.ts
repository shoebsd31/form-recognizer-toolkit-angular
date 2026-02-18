import { LoadingOverlayWeights } from "../../consts/constants";

export interface ILoadingOverlay {
    name: string;
    message: string;
    weight: LoadingOverlayWeights;
}

export interface PortalState {
    loadingOverlays: ILoadingOverlay[];
}

export const initialPortalState: PortalState = {
    loadingOverlays: [],
};
