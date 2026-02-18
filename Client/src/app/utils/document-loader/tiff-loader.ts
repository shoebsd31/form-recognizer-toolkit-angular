import * as UTIF from "utif";
import { loadUrlToArrayBuffer, loadCanvasToBlob } from "../index";
import { IDocumentLoader } from "./index";

export class TiffLoader implements IDocumentLoader {
    private url: string;
    private name: string;
    private pages: any[] = [];

    constructor(url: string, name: string) {
        this.url = url;
        this.name = name;
    }

    async loadDocumentMeta() {
        const buffer = await loadUrlToArrayBuffer(this.url);
        this.pages = UTIF.decode(buffer);
        UTIF.decodeImage(buffer, this.pages[0]);

        const canvas = this.renderPage(this.pages[0]);
        const blob = await loadCanvasToBlob(canvas);
        const thumbnail = URL.createObjectURL(blob);

        return {
            name: this.name,
            type: "image/tiff",
            url: this.url,
            thumbnail,
            numPages: this.pages.length,
            currentPage: 1,
            states: { loadingStatus: "Loaded" as const },
        };
    }

    async loadDocumentPage(pageNumber: number) {
        if (this.pages.length === 0) {
            const buffer = await loadUrlToArrayBuffer(this.url);
            this.pages = UTIF.decode(buffer);
        }
        const page = this.pages[pageNumber - 1];
        if (!page.data) {
            const buffer = await loadUrlToArrayBuffer(this.url);
            UTIF.decodeImage(buffer, page);
        }

        const canvas = this.renderPage(page);
        const blob = await loadCanvasToBlob(canvas);
        const imageUrl = URL.createObjectURL(blob);

        return {
            imageUrl,
            width: page.width,
            height: page.height,
            angle: 0,
        };
    }

    private renderPage(page: any): HTMLCanvasElement {
        const rgba = UTIF.toRGBA8(page);
        const canvas = document.createElement("canvas");
        canvas.width = page.width;
        canvas.height = page.height;
        const ctx = canvas.getContext("2d")!;
        const imageData = ctx.createImageData(page.width, page.height);
        imageData.data.set(new Uint8Array(rgba.buffer));
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
}
