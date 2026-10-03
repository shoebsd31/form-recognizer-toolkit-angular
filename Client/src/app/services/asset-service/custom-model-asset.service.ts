import { Injectable } from "@angular/core";
import { Store } from "@ngrx/store";
import { Labels, Field, Definitions, Label } from "../../models/custom-models";
import { CufPageDim } from "../../models/cuf-labels";
import { IDocument } from "../../store/documents/documents.types";
import { StorageProviderService } from "../../providers/storage-provider.service";
import { constants } from "../../consts/constants";
import { IAssetService } from "./asset-service.interface";
import { selectFields, selectDefinitions } from "../../store/custom-model/custom-model.selectors";
import { selectPredictions } from "../../store/predictions/predictions.selectors";
import {
    internalToCufLabels,
    parseLabelsFile,
    getConfidenceFromAnalyzeResult,
    getPageDimsFromAnalyzeResult,
    guessMimeType,
} from "../../utils/cuf-labels";

/**
 * Reads and writes document labels as Azure AI Content Understanding (CUF)
 * `*.labels.json` files. Conversion to/from the toolkit's internal `Label[]`
 * model lives in `utils/cuf-labels`. See CUF-LABELS-MIGRATION.md.
 *
 * Writes are always CUF format. Reads accept both CUF and legacy Form
 * Recognizer files (legacy files load, then upgrade to CUF on the next save).
 */
@Injectable({ providedIn: "root" })
export class CustomModelAssetService implements IAssetService {
    // Cached store slices (this service is an app-lifetime singleton).
    private fields: Field[] = [];
    private definitions: Definitions = {};
    private predictions: Record<string, any> = {};

    constructor(private storageProvider: StorageProviderService, private store: Store) {
        this.store.select(selectFields).subscribe((fields) => (this.fields = fields));
        this.store.select(selectDefinitions).subscribe((definitions) => (this.definitions = definitions));
        this.store.select(selectPredictions).subscribe((predictions) => (this.predictions = predictions));
    }

    /** Per-page pixel dimensions for a document, used to convert CUF `source` <-> boxes. */
    private async getAnalyzeResult(documentName: string): Promise<any> {
        let analyzeResult = this.predictions?.[documentName]?.analyzeResponse?.analyzeResult;
        if (!analyzeResult) {
            // Prefer the CU result (*.result.json), then the legacy OCR file.
            for (const ext of [constants.resultFileExtension, constants.ocrFileExtension]) {
                try {
                    const raw = await this.storageProvider.readText(`${documentName}${ext}`, true);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        analyzeResult = parsed.result ?? parsed.analyzeResult ?? parsed;
                        break;
                    }
                } catch {
                    /* try next source */
                }
            }
        }
        return analyzeResult;
    }

    private async getPageDims(documentName: string): Promise<CufPageDim[]> {
        return getPageDimsFromAnalyzeResult(await this.getAnalyzeResult(documentName));
    }

    async fetchAllDocumentLabels(labels: Labels, documents: IDocument[]): Promise<Labels> {
        const allLabels: Labels = { ...labels };
        const documentsWithoutLabels = documents.filter((doc) => !labels[doc.name]);

        await Promise.all(
            documentsWithoutLabels.map(async (doc) => {
                try {
                    const labelFile = `${doc.name}${constants.labelFileExtension}`;
                    const rawLabels = await this.storageProvider.readText(labelFile, true);
                    if (rawLabels) {
                        const analyzeResult = await this.getAnalyzeResult(doc.name);
                        allLabels[doc.name] = parseLabelsFile(
                            rawLabels,
                            getPageDimsFromAnalyzeResult(analyzeResult),
                            getConfidenceFromAnalyzeResult(analyzeResult)
                        );
                    } else {
                        allLabels[doc.name] = [];
                    }
                } catch {
                    allLabels[doc.name] = [];
                }
            })
        );

        return allLabels;
    }

    async updateFields(fields: Field[], definitions: Definitions): Promise<void> {
        const content = JSON.stringify({ fields, definitions }, null, 2);
        await this.storageProvider.writeText(constants.fieldsFile, content);
    }

    async updateDocumentLabels(updatedLabels: { [documentName: string]: Label[] }): Promise<void> {
        await Promise.all(
            Object.entries(updatedLabels).map(async ([documentName, labels]) => {
                const labelFile = `${documentName}${constants.labelFileExtension}`;
                const pageDims = await this.getPageDims(documentName);
                const cufFile = internalToCufLabels({
                    documentName,
                    mimeType: guessMimeType(documentName),
                    labels,
                    fields: this.fields,
                    definitions: this.definitions,
                    pageDims,
                });
                const content = JSON.stringify(cufFile, null, 2);
                await this.storageProvider.writeText(labelFile, content);
            })
        );
    }
}
