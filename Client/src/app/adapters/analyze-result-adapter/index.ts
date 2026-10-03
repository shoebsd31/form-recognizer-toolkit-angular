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
        // Azure AI Content Understanding results nest pages under `contents[].pages`
        // and ground words/lines with a `source` string instead of a `polygon` array.
        if (analyzeResult && Array.isArray(analyzeResult.contents)) {
            return new ContentUnderstandingAdapter(analyzeResult);
        }
        return new V3AnalyzeResultAdapter(analyzeResult);
    }
}

/**
 * Parse a Content Understanding `source` string into a flat polygon pixel array.
 * Example: "D(1,597,226,681,232,678,280,594,272)" -> [597,226,681,232,678,280,594,272].
 * Only the first `D(...)` segment is used (words/lines carry a single quad).
 */
const parseSourcePolygon = (source?: string): number[] => {
    if (!source) return [];
    const m = source.match(/D\(([^)]*)\)/);
    if (!m) return [];
    const nums = m[1].split(",").map((s) => parseFloat(s.trim()));
    // Drop the leading page number; keep the coordinate pairs.
    return nums.slice(1).filter((n) => !isNaN(n));
};

/**
 * Adapter for Azure AI Content Understanding `*.result.json` output. Normalizes it
 * to the same StudioDocumentPage shape the OCR layer consumes, converting each
 * word/line `source` polygon into the pixel `polygon` array (in the page's own
 * width/height frame, so existing coordinate math is unchanged).
 */
class ContentUnderstandingAdapter implements IAnalyzeResultAdapter {
    private analyzeResult: any;

    constructor(analyzeResult: any) {
        this.analyzeResult = analyzeResult;
    }

    getDocumentPage(pageNumber: number): StudioDocumentPage | undefined {
        return this.getDocumentPages().find((page) => page.pageNumber === pageNumber);
    }

    getDocumentPages(): StudioDocumentPage[] {
        const contents: any[] = this.analyzeResult?.contents || [];
        const pages: StudioDocumentPage[] = [];
        contents.forEach((content) => {
            (content?.pages || []).forEach((page: any) => {
                pages.push({
                    pageNumber: page.pageNumber,
                    angle: page.angle,
                    width: page.width,
                    height: page.height,
                    unit: page.unit,
                    words: (page.words || []).map((w: any) => ({
                        content: w.content,
                        polygon: parseSourcePolygon(w.source),
                        confidence: w.confidence,
                        span: w.span,
                    })),
                    lines: (page.lines || []).map((l: any) => ({
                        content: l.content,
                        polygon: parseSourcePolygon(l.source),
                        spans: l.span ? [l.span] : l.spans || [],
                    })),
                    selectionMarks: [],
                } as StudioDocumentPage);
            });
        });
        return pages;
    }

    getDocumentTables(): StudioDocumentTable[] {
        // Content Understanding tables use a different shape (cells grounded by
        // `source`, not `boundingRegions`), so they are not emitted here — the OCR
        // word/line overlay is what this adapter supplies. Returning [] avoids the
        // table layer trying to read FR-only `boundingRegions`. (CU table rendering
        // would be a separate mapping.)
        return [];
    }

    getDocumentPagedText(): ParsedContentPagedText {
        const pagedText: ParsedContentPagedText = {};
        this.getDocumentPages().forEach((page) => {
            const blocks: any[] = [];
            (page.lines || []).forEach((line) => {
                blocks.push({
                    content: line.content,
                    boundingRegions: [{ pageNumber: page.pageNumber, polygon: line.polygon }],
                });
            });
            pagedText[page.pageNumber.toString()] = blocks;
        });
        return pagedText;
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
