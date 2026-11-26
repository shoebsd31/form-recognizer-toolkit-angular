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
        const canvas = this.renderPage(await this.getPage(1));
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

    private buffer?: Promise<ArrayBuffer>;

    // Download once; decode the IFD list once; decode page pixels on demand.
    private async getBuffer() {
        if (!this.buffer) {
            this.buffer = loadUrlToArrayBuffer(this.url);
            this.buffer.catch(() => (this.buffer = undefined));
        }
        return this.buffer;
    }

    private async getPage(pageNumber: number) {
        const buffer = await this.getBuffer();
        if (this.pages.length === 0) this.pages = UTIF.decode(buffer);
        const page = this.pages[pageNumber - 1];
        if (!page.data) UTIF.decodeImage(buffer, page);
        return page;
    }

    async loadPageCount() {
        const buffer = await this.getBuffer();
        if (this.pages.length === 0) this.pages = UTIF.decode(buffer);
        return this.pages.length;
    }

    async loadPageThumbnail(pageNumber: number, maxWidth: number) {
        const full = this.renderPage(await this.getPage(pageNumber));
        const scale = Math.min(1, (maxWidth * (window.devicePixelRatio || 1)) / full.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(full.width * scale);
        canvas.height = Math.ceil(full.height * scale);
        canvas.getContext("2d")!.drawImage(full, 0, 0, canvas.width, canvas.height);
        return URL.createObjectURL(await loadCanvasToBlob(canvas));
    }

    async loadDocumentPage(pageNumber: number) {
        const page = await this.getPage(pageNumber);

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
