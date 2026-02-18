import { createFeatureSelector, createSelector } from "@ngrx/store";
import { DocumentsState } from "./documents.state";

export const selectDocumentsState = createFeatureSelector<DocumentsState>("documents");

export const selectDocuments = createSelector(selectDocumentsState, (state) => state.documents);
export const selectCurrentDocument = createSelector(selectDocumentsState, (state) => state.currentDocument);
