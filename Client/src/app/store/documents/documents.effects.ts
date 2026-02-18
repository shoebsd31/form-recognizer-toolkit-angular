import { Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { Store } from "@ngrx/store";
import { from, of } from "rxjs";
import { switchMap, map, catchError, withLatestFrom } from "rxjs/operators";
import { DocumentLoaderFactory, IDocumentLoader } from "../../utils/document-loader";
import { IRawDocument } from "./documents.types";
import * as DocumentsActions from "./documents.actions";
import { selectCurrentDocument } from "./documents.selectors";

const documentLoaders = new Map<string, IDocumentLoader>();

const getLoader = async (document: IRawDocument): Promise<IDocumentLoader> => {
    let loader = documentLoaders.get(document.url);
    if (!loader) {
        loader = await DocumentLoaderFactory.makeLoader(document);
        documentLoaders.set(document.url, loader);
    }
    return loader;
};

@Injectable()
export class DocumentsEffects {
    addDocuments$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentsActions.addDocuments),
            switchMap(({ documents }) => {
                return from(
                    Promise.all(documents.map(async (doc) => (await getLoader(doc)).loadDocumentMeta()))
                ).pipe(
                    map((loadedDocs) => DocumentsActions.addDocumentsSuccess({ documents: loadedDocs })),
                    catchError(() => of({ type: "[Documents] Add Documents Error" }))
                );
            })
        )
    );

    setCurrentDocument$ = createEffect(() =>
        this.actions$.pipe(
            ofType(DocumentsActions.setCurrentDocument),
            switchMap(({ document }) => {
                return from(
                    (async () => {
                        const loader = await getLoader(document);
                        const documentPage = await loader.loadDocumentPage(document.currentPage);
                        return { document, documentPage };
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
