import { createApplication } from "@angular/platform-browser";
import { createCustomElement } from "@angular/elements";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideStore } from "@ngrx/store";
import { provideEffects } from "@ngrx/effects";
import { provideStoreDevtools } from "@ngrx/store-devtools";

import { DocumentIntelligenceElement } from "./app/document-intelligence.element";
import { LABELING_CONFIG, DEFAULT_LABELING_CONFIG } from "./app/models/labeling-config";
import { retryInterceptor } from "./app/interceptors/retry.interceptor";

import { canvasReducer } from "./app/store/canvas/canvas.reducer";
import { customModelReducer } from "./app/store/custom-model/custom-model.reducer";
import { documentsReducer } from "./app/store/documents/documents.reducer";
import { predictionsReducer } from "./app/store/predictions/predictions.reducer";
import { portalReducer } from "./app/store/portal/portal.reducer";

import { DocumentsEffects } from "./app/store/documents/documents.effects";
import { CustomModelEffects } from "./app/store/custom-model/custom-model.effects";

(async () => {
    const app = await createApplication({
        providers: [
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
            provideStoreDevtools({ maxAge: 25, logOnly: false }),
        ],
    });

    const element = createCustomElement(DocumentIntelligenceElement, {
        injector: app.injector,
    });
    customElements.define("document-intelligence", element);
})();
