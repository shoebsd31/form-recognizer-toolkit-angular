import * as pdfjsLib from "pdfjs-dist";
import { loadCanvasToBlob } from "../index";
import { IDocumentLoader } from "./index";

/**
 * The pdf.js worker ships next to the bundle as `pdf.worker.min.mjs` (the old cdnjs `pdf.worker.min.js` does not exist for pdfjs-dist 4.x).
 * By default it is resolved relative to this script, so it works wherever the host serves the files (including under a path prefix).
 * A host can override it with the element's `worker-src` attribute (see document-intelligence.element.ts) or, for older hosts,
 * `window.__cufLabelingToolBase` (folder URL ending in "/").
 */
export function defaultPdfWorkerSrc(): string {
    const legacyBase = (globalThis as any).__cufLabelingToolBase as string | undefined;
    if (legacyBase) return legacyBase + "pdf.worker.min.mjs";
    return new URL("pdf.worker.min.mjs", import.meta.url).href;
}

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = defaultPdfWorkerSrc();

export class PdfLoader implements IDocumentLoader {
    private url: string;
    private name: string;
    private pdf: any;

    constructor(url: string, name: string) {
        this.url = url;
        this.name = name;
    }

    async loadDocumentMeta() {
        this.pdf = await pdfjsLib.getDocument(this.url).promise;
        const page = await this.pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await loadCanvasToBlob(canvas);
        const thumbnail = URL.createObjectURL(blob);

        return {
            name: this.name,
            type: "application/pdf",
            url: this.url,
            thumbnail,
            numPages: this.pdf.numPages,
            currentPage: 1,
            states: { loadingStatus: "Loaded" as const },
        };
    }

    async loadDocumentPage(pageNumber: number) {
        if (!this.pdf) {
            this.pdf = await pdfjsLib.getDocument(this.url).promise;
        }
        const page = await this.pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await loadCanvasToBlob(canvas);
        const imageUrl = URL.createObjectURL(blob);

        return {
            imageUrl,
            width: viewport.width,
            height: viewport.height,
            angle: 0,
        };
    }
}
