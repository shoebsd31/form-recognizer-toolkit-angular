import { Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { Store } from "@ngrx/store";
import { from, of } from "rxjs";
import { switchMap, map, catchError, withLatestFrom } from "rxjs/operators";
import { getDocumentLoader as getLoader } from "../../utils/document-loader/loader-cache";
import * as DocumentsActions from "./documents.actions";
import { selectCurrentDocument } from "./documents.selectors";

@Injectable()
export class DocumentsEffects {
    // Documents are no longer downloaded when they are listed: with a large folder that
    // meant fetching and rendering every file up front. A document is loaded only when it
    // is opened (setCurrentDocument$), which is also when its page count becomes known.

    setCurrentDocument$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentsActions.setCurrentDocument),
            switchMap(({ document }) => {
                return from(
                    (async () => {
                        const loader = await getLoader(document);
                        const numPages = await loader.loadPageCount();
                        const currentPage = Math.min(Math.max(document.currentPage || 1, 1), numPages);
                        const documentPage = await loader.loadDocumentPage(currentPage);
                        return { document: { ...document, numPages, currentPage }, documentPage };
                    })()
                ).pipe(
                    map(({ document, documentPage }) =>
                        DocumentsActions.setCurrentDocumentSuccess({ document, documentPage })
                    ),
                    catchError(() => of({ type: "[Documents] Set Current Document Error" }))
                );
            })
        )
    );

    setCurrentPage$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentsActions.setCurrentPage),
            withLatestFrom(this.store.select(selectCurrentDocument)),
            switchMap(([{ pageNumber }, currentDocument]) => {
                if (!currentDocument) {
                    return of({ type: "[Documents] Set Current Page Error" });
                }
                return from(
                    (async () => {
                        const loader = await getLoader(currentDocument);
                        const documentPage = await loader.loadDocumentPage(pageNumber);
                        return { pageNumber, documentPage };
                    })()
                ).pipe(
                    map(({ pageNumber, documentPage }) =>
                        DocumentsActions.setCurrentPageSuccess({ pageNumber, documentPage })
                    ),
                    catchError(() => of({ type: "[Documents] Set Current Page Error" }))
                );
            })
        )
    );

    addDocumentsPending$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentsActions.addDocuments),
            map(({ documents }) => DocumentsActions.addDocumentsPending({ documents }))
        )
    );

    setCurrentDocumentPending$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentsActions.setCurrentDocument),
            map(({ document }) => DocumentsActions.setCurrentDocumentPending({ document }))
        )
    );

    constructor(private actions$: Actions, private store: Store) {}
}
