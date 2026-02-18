import { IDocumentLoader } from "./index";

export class ImageLoader implements IDocumentLoader {
    private url: string;
    private name: string;
    private type: string;

    constructor(url: string, name: string, type: string) {
        this.url = url;
        this.name = name;
        this.type = type;
    }

    async loadDocumentMeta() {
        const { width, height } = await this.loadImage();

        return {
            name: this.name,
            type: this.type,
            url: this.url,
            thumbnail: this.url,
            numPages: 1,
            currentPage: 1,
            states: { loadingStatus: "Loaded" as const },
        };
    }

    async loadDocumentPage(pageNumber: number) {
        const { width, height } = await this.loadImage();

        return {
            imageUrl: this.url,
            width,
            height,
            angle: 0,
        };
    }

    private loadImage(): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = reject;
            img.src = this.url;
        });
    }
}
