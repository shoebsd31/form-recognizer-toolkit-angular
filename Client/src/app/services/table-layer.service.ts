import { Injectable, OnDestroy } from "@angular/core";
import { Store } from "@ngrx/store";
import { BehaviorSubject, Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { Feature } from "ol";
import { Extent } from "ol/extent";
import MultiPolygon from "ol/geom/MultiPolygon";
import Point from "ol/geom/Point";

import { ImageMapComponent } from "../components/image-map/image-map.component";
import { createRegionIdFromPolygon } from "../components/image-map/utils";
import { AnalyzeResultAdapterFactory } from "../adapters/analyze-result-adapter";
import { isAnyBoundingRegionInPage, getPagePolygons } from "../utils/analyze-result";
import { tableBorderFeatureStyler, tableIconStyler, TableState } from "../utils/styler";
import { StudioDocumentTable } from "../models/analyze-result";
import { selectCurrentDocument } from "../store/documents/documents.selectors";
import { selectPredictions } from "../store/predictions/predictions.selectors";
import { IDocument } from "../store/documents/documents.types";
import { IPrediction } from "../store/predictions/predictions.state";

export interface TableIconTooltip {
    display: string;
    width: number;
    height: number;
    top: number;
    left: number;
    rows?: number;
    columns?: number;
}

export interface TableFeatures {
    icon: Feature;
    border: Feature;
}

@Injectable({ providedIn: "root" })
export class TableLayerService implements OnDestroy {
    private imageMap: ImageMapComponent | null = null;
    private destroy$ = new Subject<void>();

    private tableIdToIndexMap: { [key: string]: number } = {};
    public hoveringFeatureId: string | null = null;

    private currentDocument: IDocument | null = null;
    private predictions: { [name: string]: IPrediction } = {};

    /**
     * Exposes the stylers so the host component can bind them
     * to the ImageMap's table-related style inputs.
     */
    public readonly tableBorderFeatureStyler = tableBorderFeatureStyler;
    public readonly tableIconFeatureStyler = tableIconStyler;

    /**
     * Observable that emits tooltip state for the table icon hover tooltip.
     */
    public tableIconTooltip$ = new BehaviorSubject<TableIconTooltip>({
        display: "none",
        width: 0,
        height: 0,
        top: 0,
        left: 0,
    });

    /**
     * Observable that emits the currently viewed table (when user clicks icon).
     */
    public tableToView$ = new BehaviorSubject<{ table: StudioDocumentTable | null; tableId: string | null }>({
        table: null,
        tableId: null,
    });

    constructor(private store: Store) {}

    /**
     * Initializes the service with a reference to the ImageMap component
     * and subscribes to store state changes for reactive redrawing.
     */
    initialize(imageMap: ImageMapComponent): void {
        this.imageMap = imageMap;

        this.store
            .select(selectCurrentDocument)
            .pipe(takeUntil(this.destroy$))
            .subscribe((currentDocument) => {
                const previous = this.currentDocument;
                this.currentDocument = currentDocument;
                if (previous !== currentDocument && currentDocument) {
                    this.clearTableFeatures();
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
                    this.clearTableFeatures();
                    this.redrawIfAnalyzeResultAvailable();
                }
            });
    }

    /**
     * Draws table border and icon features for a given page
     * from the provided analyze result.
     */
    drawTables(analyzeResult: any, targetPage: number): void {
        const tableBorderFeatures: Feature[] = [];
        const tableIconFeatures: Feature[] = [];
        this.tableIdToIndexMap = {};

        const analyzeResultAdapter = AnalyzeResultAdapterFactory.create(analyzeResult);
        const documentPage = analyzeResultAdapter.getDocumentPage(targetPage);
        const documentTables = analyzeResultAdapter.getDocumentTables();

        if (documentTables.length !== 0 && documentPage) {
            const tables = documentTables.filter((table) =>
                isAnyBoundingRegionInPage(table.boundingRegions, targetPage)
            );
            const { width, height } = documentPage;

            tables.forEach((table, index) => {
                const { icon, border } = this.createTableFeatures(table, width, height, targetPage, index);
                tableIconFeatures.push(icon);
                tableBorderFeatures.push(border);
            });

            if (tableIconFeatures.length > 0 && tableIconFeatures.length === tableBorderFeatures.length) {
                this.imageMap?.addTableIconFeatures(tableIconFeatures);
                this.imageMap?.addTableBorderFeatures(tableBorderFeatures);
            }
        }
    }

    /**
     * Clears all table border and icon features from the map.
     */
    clearTableFeatures(): void {
        this.imageMap?.removeAllTableBorderFeatures();
        this.imageMap?.removeAllTableIconFeatures();
    }

    /**
     * Handles tooltip state changes when hovering over table icon features.
     * Called by the host component when it receives handleTableToolTipChange events.
     */
    handleTableToolTipChange(
        display: string,
        width: number,
        height: number,
        top: number,
        left: number,
        rows: number,
        columns: number,
        featureId: string | null
    ): void {
        if (!this.imageMap) {
            return;
        }

        if (featureId !== null) {
            this.setTableState(featureId, TableState.Hovered);
        }

        const prevFeatureId = this.hoveringFeatureId;
        if (prevFeatureId) {
            this.setTableState(prevFeatureId, TableState.None);
        }

        const tooltip: TableIconTooltip = {
            display,
            width,
            height,
            top,
            left,
            rows,
            columns,
        };
        this.hoveringFeatureId = featureId;
        this.tableIconTooltip$.next(tooltip);
    }

    /**
     * Handles the click on a table icon feature, opening the table view.
     */
    handleTableIconClick(): void {
        const tableToViewId = this.hoveringFeatureId;
        if (!tableToViewId) {
            return;
        }

        const tableToView = this.getTableData(
            this.currentDocument?.currentPage || 1,
            tableToViewId
        );
        this.tableToView$.next({ table: tableToView || null, tableId: tableToViewId });
    }

    /**
     * Handles closing the table view panel.
     */
    handleTableViewClose(): void {
        const current = this.tableToView$.value;
        if (current.table) {
            if (current.tableId) {
                this.setTableState(current.tableId, TableState.None);
            }
            this.tableToView$.next({ table: null, tableId: null });
        }
    }

    /**
     * Highlights all table border features on the canvas (sets them to Hovered state).
     */
    highlightAllTables(): void {
        if (!this.imageMap) return;
        const borderFeatures = this.imageMap.getAllTableBorderFeatures() || [];
        const iconFeatures = this.imageMap.getAllTableIconFeatures() || [];
        borderFeatures.forEach((f: Feature) => f.set("state", TableState.Hovered));
        iconFeatures.forEach((f: Feature) => f.set("state", TableState.Hovered));
    }

    /**
     * Resets all table border features to default state.
     */
    unhighlightAllTables(): void {
        if (!this.imageMap) return;
        const borderFeatures = this.imageMap.getAllTableBorderFeatures() || [];
        const iconFeatures = this.imageMap.getAllTableIconFeatures() || [];
        borderFeatures.forEach((f: Feature) => f.set("state", TableState.None));
        iconFeatures.forEach((f: Feature) => f.set("state", TableState.None));
    }

    /**
     * Clean up subscriptions and state on service destruction.
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
        const prediction = this.predictions[this.currentDocument.name];
        if (prediction && prediction.analyzeResponse.analyzeResult) {
            const analyzeResult = prediction.analyzeResponse.analyzeResult;
            this.drawTables(analyzeResult, this.currentDocument.currentPage);
        }
    }

    private setTableState(tableId: string, state: TableState): void {
        const borderFeature = this.imageMap?.getTableBorderFeatureByID(tableId);
        const iconFeature = this.imageMap?.getTableIconFeatureByID(tableId);
        if (borderFeature) {
            borderFeature.set("state", state);
        }
        if (iconFeature) {
            iconFeature.set("state", state);
        }
    }

    private getTableData(targetPage: number, tableId: string): StudioDocumentTable | undefined {
        if (!this.currentDocument) {
            return undefined;
        }
        const prediction = this.predictions[this.currentDocument.name];
        if (!prediction) {
            return undefined;
        }
        const analyzeResult = prediction.analyzeResponse.analyzeResult;
        const analyzeResultAdapter = AnalyzeResultAdapterFactory.create(analyzeResult);
        const documentTables = analyzeResultAdapter.getDocumentTables();
        const tables = documentTables.filter((table) =>
            isAnyBoundingRegionInPage(table.boundingRegions, targetPage)
        );
        return tables[this.tableIdToIndexMap[tableId]];
    }

    private createTableFeatures(
        table: StudioDocumentTable,
        ocrWidth: number,
        ocrHeight: number,
        page: number,
        index: number
    ): TableFeatures {
        const imageExtent = this.imageMap?.getImageExtent() as Extent;
        const imageWidth = imageExtent[2] - imageExtent[0];
        const imageHeight = imageExtent[3] - imageExtent[1];

        const { rowCount, columnCount, boundingRegions } = table;
        const coordinatesList: number[][][] = [];

        getPagePolygons(boundingRegions, page).forEach((polygon) => {
            const coordinates: number[][] = [];
            for (let i = 0; i < polygon.length; i += 2) {
                coordinates.push([
                    Math.round((polygon[i] / ocrWidth) * imageWidth),
                    Math.round((1 - polygon[i + 1] / ocrHeight) * imageHeight),
                ]);
            }
            coordinatesList.push(coordinates);
        });

        // Take first bounding box to be table id.
        const tableId = createRegionIdFromPolygon(boundingRegions[0].polygon, page);
        this.tableIdToIndexMap[tableId] = index;

        const border = new Feature({
            geometry: new MultiPolygon([coordinatesList]),
            id: tableId,
            state: TableState.None,
        });
        border.setId(tableId);

        // Attach icon on first bounding region.
        const icon = new Feature({
            geometry: new Point([coordinatesList[0][0][0], coordinatesList[0][0][1]]),
            id: tableId,
            state: TableState.None,
            rows: rowCount,
            columns: columnCount,
        });
        icon.setId(tableId);

        return { border, icon };
    }
}
