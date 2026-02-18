import {
    StudioDocumentPage,
    StudioDocumentTable,
    ParsedContentPagedText,
} from "../../models/analyze-result";

export interface IAnalyzeResultAdapter {
    getDocumentPage(pageNumber: number): StudioDocumentPage | undefined;
    getDocumentPages(): StudioDocumentPage[];
    getDocumentTables(): StudioDocumentTable[];
    getDocumentPagedText(): ParsedContentPagedText;
}

export class AnalyzeResultAdapterFactory {
    static create(analyzeResult: any): IAnalyzeResultAdapter {
        return new V3AnalyzeResultAdapter(analyzeResult);
    }
}

class V3AnalyzeResultAdapter implements IAnalyzeResultAdapter {
    private analyzeResult: any;

    constructor(analyzeResult: any) {
        this.analyzeResult = analyzeResult;
    }

    getDocumentPage(pageNumber: number): StudioDocumentPage | undefined {
        const pages = this.getDocumentPages();
        return pages.find((page) => page.pageNumber === pageNumber);
    }

    getDocumentPages(): StudioDocumentPage[] {
        return this.analyzeResult?.pages || [];
    }

    getDocumentTables(): StudioDocumentTable[] {
        return this.analyzeResult?.tables || [];
    }

    getDocumentPagedText(): ParsedContentPagedText {
        const pages = this.getDocumentPages();
        const pagedText: ParsedContentPagedText = {};

        pages.forEach((page) => {
            const blocks: any[] = [];
            if (page.lines) {
                page.lines.forEach((line) => {
                    blocks.push({
                        content: line.content,
                        boundingRegions: [{ pageNumber: page.pageNumber, polygon: line.polygon }],
                    });
                });
            }
            pagedText[page.pageNumber.toString()] = blocks;
        });

        return pagedText;
    }
}
