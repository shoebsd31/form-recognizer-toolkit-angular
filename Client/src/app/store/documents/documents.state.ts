import { IDocument } from "./documents.types";

export interface DocumentsState {
    documents: IDocument[];
    currentDocument: IDocument | null;
}

export const initialDocumentsState: DocumentsState = {
    documents: [],
    currentDocument: null,
};
