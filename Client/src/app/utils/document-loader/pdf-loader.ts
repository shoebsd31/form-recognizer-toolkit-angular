import * as pdfjsLib from "pdfjs-dist";
import { loadCanvasToBlob } from "../index";
import { IDocumentLoader } from "./index";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as any).version}/pdf.worker.min.js`;

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
