import { Injectable, OnDestroy } from "@angular/core";
import { Store } from "@ngrx/store";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { Feature } from "ol";
import { Extent } from "ol/extent";
import Polygon from "ol/geom/Polygon";

import { ImageMapComponent } from "../components/image-map/image-map.component";
import { FeatureCategory } from "../components/image-map/contracts";
import { FIELD_PROPERTY } from "../components/image-map/constants";
import {
    createRegionIdFromPolygon,
    convertToImageMapCoordinates,
    Dimension,
} from "../components/image-map/utils";
import { AnalyzeResultAdapterFactory, IAnalyzeResultAdapter } from "../adapters/analyze-result-adapter";
import { checkboxStyler } from "../utils/styler";
import { selectVisibleAnalyzedElement } from "../store/canvas/canvas.selectors";
import { selectCurrentDocument } from "../store/documents/documents.selectors";
import { selectPredictions } from "../store/predictions/predictions.selectors";
import { VisibleAnalyzedElement, VisibleAnalyzedElementEnum } from "../store/canvas/canvas.state";
import { IDocument } from "../store/documents/documents.types";
import { IPrediction } from "../store/predictions/predictions.state";

@Injectable({ providedIn: "root" })
export class OcrLayerService implements OnDestroy {
    private imageMap: ImageMapComponent | null = null;
    private destroy$ = new Subject<void>();

    private currentDocument: IDocument | null = null;
    private predictions: { [name: string]: IPrediction } = {};
    private visibleAnalyzedElement: VisibleAnalyzedElement = {
        [VisibleAnalyzedElementEnum.Words]: true,
    };

    /**
     * Exposes the checkbox styler so the host component can bind it
     * to the ImageMap's checkboxFeatureStyler input.
     */
    public readonly checkboxFeatureStyler = checkboxStyler;

    constructor(private store: Store) {}

    /**
     * Initializes the service with a reference to the ImageMap component
     * and subscribes to store state changes for reactive redrawing.
     */
    initialize(imageMap: ImageMapComponent): void {
        this.imageMap = imageMap;

        this.store
            .select(selectVisibleAnalyzedElement)
            .pipe(takeUntil(this.destroy$))
            .subscribe((visibleAnalyzedElement) => {
                const previous = this.visibleAnalyzedElement;
                this.visibleAnalyzedElement = visibleAnalyzedElement;
                if (previous !== visibleAnalyzedElement && this.currentDocument) {
                    this.redrawIfAnalyzeResultAvailable();
                }
            });

        this.store
            .select(selectCurrentDocument)
            .pipe(takeUntil(this.destroy$))
            .subscribe((currentDocument) => {
                const previous = this.currentDocument;
                this.currentDocument = currentDocument;
                if (previous !== currentDocument && currentDocument) {
                    this.clearOcrFeatures();
                    this.redrawIfAnalyzeResultAvailable();
                }
            });

        this.store
            .select(selectPredictions)
            .pipe(takeUntil(this.destroy$))
            .subscribe((predictions) => {
                const previous = this.predictions;
                this.predictions = predictions;
                if (previous !== predictions && this.currentDocument) {
                    this.clearOcrFeatures();
                    this.redrawIfAnalyzeResultAvailable();
                }
            });
    }

    /**
     * Draws OCR results (text words, lines, selection marks) for a given page
     * from the provided analyze result.
     */
    drawOcrResults(analyzeResult: any, targetPage: number): void {
        const analyzeResultAdapter = AnalyzeResultAdapterFactory.create(analyzeResult);
        const documentPage = analyzeResultAdapter.getDocumentPage(targetPage);
        const imageExtent = this.imageMap?.getImageExtent() as Extent;
        const textFeatures: Feature[] = [];
        const lineFeatures: Feature[] = [];
        const selectionMarkFeatures: Feature[] = [];

        if (!documentPage) {
            return;
        }

        const { pageNumber, width, height, words, selectionMarks, lines } = documentPage;
        const ocrExtent: Extent = [0, 0, width, height];

        if (this.visibleAnalyzedElement[VisibleAnalyzedElementEnum.Lines]) {
            const features = this.createPrebuiltLineFeatures(lines, imageExtent, ocrExtent, pageNumber);
            lineFeatures.push(...features);
        }

        if (this.visibleAnalyzedElement[VisibleAnalyzedElementEnum.Words]) {
            words.forEach((word) => {
                const { content, polygon } = word;
                textFeatures.push(
                    this.createFeature(content, polygon, imageExtent, ocrExtent, pageNumber, FeatureCategory.Text)
                );
            });
        }

        (selectionMarks || []).forEach((selectionMark) => {
            const { state, polygon } = selectionMark;
            selectionMarkFeatures.push(
                this.createFeature(
                    state,
                    polygon,
                    imageExtent,
                    ocrExtent,
                    pageNumber,
                    FeatureCategory.Checkbox,
                    selectionMark
                )
            );
        });

        if (textFeatures.length > 0) {
            this.imageMap?.addFeatures(textFeatures);
        }

        if (lineFeatures.length > 0) {
            this.imageMap?.addFeatures(lineFeatures);
        }

        if (selectionMarkFeatures.length > 0) {
            this.imageMap?.addCheckboxFeatures(selectionMarkFeatures);
        }
    }

    /**
     * Clears all OCR text features and checkbox features from the map.
     */
    clearOcrFeatures(): void {
        this.imageMap?.removeAllTextFeatures();
        this.imageMap?.removeAllCheckboxFeatures();
    }

    /**
     * Convenience method that draws document features by reading
     * the current document's analyze result from predictions state.
     */
    drawDocumentFeatures(currentDocument: IDocument, predictions: { [name: string]: IPrediction }): void {
        if (
            predictions[currentDocument.name] &&
            predictions[currentDocument.name].analyzeResponse.analyzeResult
        ) {
            const analyzeResult = predictions[currentDocument.name].analyzeResponse.analyzeResult;
            this.drawOcrResults(analyzeResult, currentDocument.currentPage);
        }
    }

    /**
     * Clean up subscriptions on service destruction.
     */
    destroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.imageMap = null;
    }

    ngOnDestroy(): void {
        this.destroy();
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private redrawIfAnalyzeResultAvailable(): void {
        if (!this.currentDocument) {
            return;
        }
        if (
            this.predictions[this.currentDocument.name] &&
            this.predictions[this.currentDocument.name].analyzeResponse.analyzeResult
        ) {
            this.clearOcrFeatures();
            this.drawOcrResults(
                this.predictions[this.currentDocument.name].analyzeResponse.analyzeResult,
                this.currentDocument.currentPage
            );
        }
    }

    private createPrebuiltLineFeatures(
        lines: any,
        imageExtent: Extent,
        ocrExtent: Extent,
        page: number
    ): Feature[] {
        if (!lines) {
            return [];
        }

        const features: Feature[] = [];
        const canvasSize: Dimension = {
            width: imageExtent[2] - imageExtent[0],
            height: imageExtent[3] - imageExtent[1],
        };
        const documentSize: Dimension = {
            width: ocrExtent[2] - ocrExtent[0],
            height: ocrExtent[3] - ocrExtent[1],
        };

        lines.forEach((lineItem: any) => {
            const featureId = createRegionIdFromPolygon(lineItem.polygon, page);
            const coordinates: number[][] = convertToImageMapCoordinates(
                lineItem.polygon,
                canvasSize,
                documentSize
            );
            const feature = new Feature({
                geometry: new Polygon([coordinates]),
                id: featureId,
                [FIELD_PROPERTY]: lineItem,
            });
            feature.setId(featureId);
            features.push(feature);
        });

        return features;
    }

    private createFeature(
        text: string,
        polygon: number[],
        imageExtent: Extent,
        ocrExtent: Extent,
        page: number,
        category: FeatureCategory,
        fieldItem?: any
    ): Feature {
        const coordinates: number[][] = [];
        const polygonPoints: number[] = [];

        const imageWidth = imageExtent[2] - imageExtent[0];
        const imageHeight = imageExtent[3] - imageExtent[1];
        const ocrWidth = ocrExtent[2] - ocrExtent[0];
        const ocrHeight = ocrExtent[3] - ocrExtent[1];

        for (let i = 0; i < polygon.length; i += 2) {
            coordinates.push([
                Math.round((polygon[i] / ocrWidth) * imageWidth),
                Math.round((1 - polygon[i + 1] / ocrHeight) * imageHeight),
            ]);
            polygonPoints.push(polygon[i] / ocrWidth);
            polygonPoints.push(polygon[i + 1] / ocrHeight);
        }

        const featureId = createRegionIdFromPolygon(polygonPoints, page);
        const feature = new Feature({
            geometry: new Polygon([coordinates]),
            id: featureId,
            text,
            polygon,
            highlighted: false,
            isOcrProposal: true,
            category,
            [FIELD_PROPERTY]: fieldItem,
        });
        feature.setId(featureId);

        return feature;
    }
}
