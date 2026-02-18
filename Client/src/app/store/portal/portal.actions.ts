import { createAction, props } from "@ngrx/store";

export const addLoadingOverlay = createAction(
    "[Portal] Add Loading Overlay",
    props<{ name: string; message?: string; weight?: number }>()
);

export const removeLoadingOverlayByName = createAction(
    "[Portal] Remove Loading Overlay By Name",
    props<{ name: string }>()
);
