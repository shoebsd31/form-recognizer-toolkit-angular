import { createAction, props } from "@ngrx/store";
import { ICanvas } from "../canvas/canvas.state";
import { IDocument, IRawDocument } from "./documents.types";

// Sync actions
export const deleteDocument = createAction("[Documents] Delete Document", props<{ document: IDocument }>());
export const setDocumentAnalyzingStatus = createAction(
    "[Documents] Set Document Analyzing Status",
    props<{ name: string; status: any }>()
);
export const setDocumentLabelingStatus = createAction(
    "[Documents] Set Document Labeling Status",
    props<{ name: string; status: any }>()
);
export const clearCurrentDocument = createAction("[Documents] Clear Current Document");

// Async actions
export const addDocuments = createAction("[Documents] Add Documents", props<{ documents: IRawDocument[] }>());
export const addDocumentsPending = createAction(
    "[Documents] Add Documents Pending",
    props<{ documents: IRawDocument[] }>()
);
export const addDocumentsSuccess = createAction(
    "[Documents] Add Documents Success",
    props<{ documents: IDocument[] }>()
);

export const setCurrentDocument = createAction("[Documents] Set Current Document", props<{ document: IDocument }>());
export const setCurrentDocumentPending = createAction(
    "[Documents] Set Current Document Pending",
    props<{ document: IDocument }>()
);
export const setCurrentDocumentSuccess = createAction(
    "[Documents] Set Current Document Success",
    props<{ document: IDocument; documentPage: ICanvas }>()
);

export const setCurrentPage = createAction("[Documents] Set Current Page", props<{ pageNumber: number }>());
export const setCurrentPageSuccess = createAction(
    "[Documents] Set Current Page Success",
    props<{ pageNumber: number; documentPage: ICanvas }>()
);
