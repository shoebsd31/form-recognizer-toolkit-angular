import { DocumentLoaderFactory, IDocumentLoader } from "./index";
import { IRawDocument } from "../../store/documents/documents.types";

// One loader per document URL, shared by the store effects (page images) and the
// page strip (thumbnails), so a PDF/TIFF is downloaded and parsed only once.
const documentLoaders = new Map<string, Promise<IDocumentLoader>>();

export const getDocumentLoader = (document: IRawDocument): Promise<IDocumentLoader> => {
    let loader = documentLoaders.get(document.url);
    if (!loader) {
        loader = DocumentLoaderFactory.makeLoader(document);
        documentLoaders.set(document.url, loader);
        loader.catch(() => documentLoaders.delete(document.url));
    }
    return loader;
};
