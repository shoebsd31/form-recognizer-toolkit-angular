import { createReducer, on } from "@ngrx/store";
import { DocumentStatus } from "./documents.types";
import { initialDocumentsState } from "./documents.state";
import * as DocumentsActions from "./documents.actions";
import * as PredictionsActions from "../predictions/predictions.actions";

export const documentsReducer = createReducer(
    initialDocumentsState,
    on(DocumentsActions.deleteDocument, (state, { document: docToDelete }) => ({
        ...state,
        documents: state.documents.filter((doc) => doc.name !== docToDelete.name),
    })),
    on(DocumentsActions.setDocumentAnalyzingStatus, (state, { name, status }) => {
        const documents = state.documents.map((doc) =>
            doc.name === name ? { ...doc, states: { ...doc.states, analyzingStatus: status } } : doc
        );
        const currentDocument =
            state.currentDocument?.name === name
                ? { ...state.currentDocument, states: { ...state.currentDocument.states, analyzingStatus: status } }
                : state.currentDocument;
        return { ...state, documents, currentDocument };
    }),
    on(DocumentsActions.setDocumentLabelingStatus, (state, { name, status }) => {
        const documents = state.documents.map((doc) =>
            doc.name === name ? { ...doc, states: { ...doc.states, labelingStatus: status } } : doc
        );
        const currentDocument =
            state.currentDocument?.name === name
                ? { ...state.currentDocument, states: { ...state.currentDocument.states, labelingStatus: status } }
                : state.currentDocument;
        return { ...state, documents, currentDocument };
    }),
    on(DocumentsActions.clearCurrentDocument, (state) => ({
        ...state,
        currentDocument: null,
    })),
    on(DocumentsActions.addDocumentsPending, (state, { documents: docs }) => ({
        ...state,
        documents: [
            ...state.documents,
            ...docs.map((doc) => ({
                ...doc,
                thumbnail: "",
                numPages: 0,
                currentPage: 0,
                states: { loadingStatus: DocumentStatus.Loading as const },
            })),
        ],
    })),
    on(DocumentsActions.addDocumentsSuccess, (state, { documents: addedDocs }) => {
        const updatedDocuments = state.documents.map((doc) => {
            const addedDoc = addedDocs.find((d) => d.name === doc.name);
            if (addedDoc) {
                return { ...addedDoc, states: { ...doc.states, loadingStatus: DocumentStatus.Loaded as const } };
            }
            return doc;
        });
        return { ...state, documents: updatedDocuments };
    }),
    on(DocumentsActions.setCurrentDocumentPending, (state, { document }) => {
        const documents = state.documents.map((doc) =>
            doc.name === document.name ? { ...doc, states: { ...doc.states, loadingStatus: DocumentStatus.Loading as const } } : doc
        );
        return { ...state, documents };
    }),
    on(DocumentsActions.setCurrentDocumentSuccess, (state, { document, documentPage }) => {
        const updatedDoc = { ...document, states: { ...document.states, loadingStatus: DocumentStatus.Loaded as const } };
        const documents = state.documents.map((doc) =>
            doc.name === document.name ? { ...doc, states: { ...doc.states, loadingStatus: DocumentStatus.Loaded as const } } : doc
        );
        return { ...state, documents, currentDocument: updatedDoc };
    }),
    on(DocumentsActions.setCurrentPageSuccess, (state, { pageNumber }) => {
        const documents = state.documents.map((doc) =>
            doc.name === state.currentDocument?.name ? { ...doc, currentPage: pageNumber } : doc
        );
        const currentDocument = state.currentDocument
            ? { ...state.currentDocument, currentPage: pageNumber }
            : null;
        return { ...state, documents, currentDocument };
    }),
    on(PredictionsActions.resetPredictions, (state) => {
        const documents = state.documents.map((doc) => ({
            ...doc,
            states: { ...doc.states, analyzingStatus: undefined },
        }));
        const currentDocument = state.currentDocument
            ? { ...state.currentDocument, states: { ...state.currentDocument.states, analyzingStatus: undefined } }
            : null;
        return { ...state, documents, currentDocument };
    })
);
