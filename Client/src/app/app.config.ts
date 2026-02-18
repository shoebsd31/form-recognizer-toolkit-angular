import { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideStore } from "@ngrx/store";
import { provideEffects } from "@ngrx/effects";
import { provideStoreDevtools } from "@ngrx/store-devtools";

import { routes } from "./app.routes";
import { retryInterceptor } from "./interceptors/retry.interceptor";
import { LABELING_CONFIG, DEFAULT_LABELING_CONFIG } from "./models/labeling-config";

import { canvasReducer } from "./store/canvas/canvas.reducer";
import { customModelReducer } from "./store/custom-model/custom-model.reducer";
import { documentsReducer } from "./store/documents/documents.reducer";
import { predictionsReducer } from "./store/predictions/predictions.reducer";
import { portalReducer } from "./store/portal/portal.reducer";

import { DocumentsEffects } from "./store/documents/documents.effects";
import { CustomModelEffects } from "./store/custom-model/custom-model.effects";

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([retryInterceptor])),
        provideAnimationsAsync(),
        { provide: LABELING_CONFIG, useValue: DEFAULT_LABELING_CONFIG },
        provideStore({
            canvas: canvasReducer,
            customModel: customModelReducer,
            documents: documentsReducer,
            predictions: predictionsReducer,
            portal: portalReducer,
        }),
        provideEffects([DocumentsEffects, CustomModelEffects]),
        provideStoreDevtools({
            maxAge: 25,
            logOnly: false,
        }),
    ],
};
