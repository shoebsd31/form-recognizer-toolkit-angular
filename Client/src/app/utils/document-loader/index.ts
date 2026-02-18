import { IRawDocument } from "../../store/documents/documents.types";

export const DocumentMimeType = {
    pdf: "application/pdf",
    tiff: "image/tiff",
    png: "image/png",
    jpeg: "image/jpeg",
    bmp: "image/bmp",
};

export interface IDocumentLoader {
    loadDocumentMeta(): Promise<any>;
    loadDocumentPage(pageNumber: number): Promise<any>;
}

export function getDocumentType(name: string): string {
    const extension = name.split(".").pop()?.toLowerCase() || "";
    const typeMap: Record<string, string> = {
        pdf: DocumentMimeType.pdf,
        tif: DocumentMimeType.tiff,
        tiff: DocumentMimeType.tiff,
        png: DocumentMimeType.png,
        jpg: DocumentMimeType.jpeg,
        jpeg: DocumentMimeType.jpeg,
        bmp: DocumentMimeType.bmp,
    };
    return typeMap[extension] || "";
}

export function isSupportedFile(filePath: string): boolean {
    const supportedExtensions = ["pdf", "tif", "tiff", "png", "jpg", "jpeg", "bmp"];
    const extension = filePath.split(".").pop()?.toLowerCase() || "";
    return supportedExtensions.includes(extension);
}

export class DocumentLoaderFactory {
    static async makeLoader(document: IRawDocument): Promise<IDocumentLoader> {
        const { type, url, name } = document;

        if (type === DocumentMimeType.pdf) {
            const { PdfLoader } = await import("./pdf-loader");
            return new PdfLoader(url, name);
        } else if (type === DocumentMimeType.tiff) {
            const { TiffLoader } = await import("./tiff-loader");
            return new TiffLoader(url, name);
        } else {
            const { ImageLoader } = await import("./image-loader");
            return new ImageLoader(url, name, type);
        }
    }
}
