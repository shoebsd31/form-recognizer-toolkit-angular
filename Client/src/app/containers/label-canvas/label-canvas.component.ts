import { Component, Input, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngrx/store";
import { Subject } from "rxjs";
import { takeUntil, pairwise, startWith } from "rxjs/operators";
import { ImageMapComponent} from "../../components/image-map/image-map.component";
import { ImageMapToolbarComponent } from "../../components/image-map-toolbar/image-map-toolbar.component";
import { PageControlComponent } from "../../components/page-control/page-control.component";
import { LayerFilterComponent, ILayerCheckStates, ILayerFilterItem } from "../../components/layer-filter/layer-filter.component";
import { AnalyzeProgressBarComponent } from "../../components/analyze-progress-bar/analyze-progress-bar.component";
import { TableViewComponent } from "../../components/table-view/table-view.component";
import { InlineLabelMenuComponent } from "../inline-label-menu/inline-label-menu.component";

import { OcrLayerService } from "../../services/ocr-layer.service";
import { TableLayerService } from "../../services/table-layer.service";
import { CustomModelLabelService } from "../../services/custom-model-label.service";

import { selectCurrentDocument } from "../../store/documents/documents.selectors";
import { selectCanvas } from "../../store/canvas/canvas.selectors";
import { setCurrentPage } from "../../store/documents/documents.actions";
import { setAngle } from "../../store/canvas/canvas.actions";
import { IDocument, DocumentStatus } from "../../store/documents/documents.types";
import { ICanvas } from "../../store/canvas/canvas.state";
import { defaultStyler } from "../../utils/styler";

@Component({
    selector: "app-label-canvas",
    standalone: true,
    imports: [
        CommonModule,
        ImageMapComponent,
        ImageMapToolbarComponent,
        PageControlComponent,
        LayerFilterComponent,
        AnalyzeProgressBarComponent,
        TableViewComponent,
        InlineLabelMenuComponent,
    ],
    template: `
        <div class="label-canvas">
            <div class="label-canvas-command-bar">
                <button
                    *ngIf="allowDrawRegion"
                    class="draw-region-button"
                    [class.active]="drawRegionMode"
                    [disabled]="isButtonDisabled"
                    (click)="handleDrawRegion()"
                    title="Draw region"
                    aria-label="Draw region"
                >
                    <i class="pi pi-stop"></i>
                    <span>Draw region</span>
                </button>
                <app-layer-filter
                    [disabled]="isButtonDisabled"
                    [checkStates]="layerCheckStates"
                    (itemClick)="handleLayerFilterChange($event)"
                ></app-layer-filter>
            </div>
            <div class="label-canvas-image-map">
                <app-image-map
                    *ngIf="canvas && canvas.imageUrl"
                    [imageUri]="canvas.imageUrl"
                    [imageWidth]="canvas.width"
                    [imageHeight]="canvas.height"
                    [imageAngle]="canvas.angle"
                    [initLayoutMap]="true"
                    [featureStyler]="featureStyler"
                    [checkboxFeatureStyler]="ocrLayerService.checkboxFeatureStyler"
                    [tableBorderFeatureStyler]="tableLayerService.tableBorderFeatureStyler"
                    [tableIconFeatureStyler]="tableLayerService.tableIconFeatureStyler"
                    [labelFeatureStyler]="labelService.labelFeatureStyler"
                    [drawRegionStyler]="labelService.drawRegionStyler"
                    [drawnRegionStyler]="labelService.drawnRegionStyler"
                    [modifyStyler]="labelService.modifyStyler"
                    [hoveringFeature]="tableLayerService.hoveringFeatureId ?? undefined"
                    [enableFeatureSelection]="true"
                    [drawRegionMode]="drawRegionMode"
                    (setImageMap)="onSetImageMap($event)"
                    (onMapReady)="onMapReady()"
                    (handleFeatureSelect)="onFeatureSelect($event)"
                    (onFinishFeatureSelect)="onFinishFeatureSelect()"
                    (handleTableToolTipChange)="onTableToolTipChange($event)"
                    (addDrawnRegionFeatureProps)="onDrawnRegionFeature($event)"
                    (updateFeatureAfterModify)="onFeatureModify($event)"
                    (handleIsPointerOnImage)="labelService.handleIsPointerOnImage($event)"
                    (handleDrawing)="labelService.handleDrawingChange($event)"
                    (handleVertexDrag)="labelService.handleVertexDragging($event)"
                    (handleIsSnapped)="labelService.handleSnapped($event)"
                    (onDrawnRegionFeatureHovered)="onDrawnRegionHovered($event)"
                ></app-image-map>
                <div
                    *ngIf="currentDocument && isAnalyzing"
                    class="label-canvas-overlay"
                >
                    <app-analyze-progress-bar
                        [title]="'Running analysis:'"
                        [subtitle]="currentDocument.name"
                        [percentComplete]="progress"
                    ></app-analyze-progress-bar>
                </div>

                <!-- Table Icon Tooltip -->
                <div
                    class="table-icon-tooltip"
                    [style.display]="(tableLayerService.tableIconTooltip$ | async)?.display || 'none'"
                    [style.top.px]="(tableLayerService.tableIconTooltip$ | async)?.top"
                    [style.left.px]="(tableLayerService.tableIconTooltip$ | async)?.left"
                    [style.width.px]="(tableLayerService.tableIconTooltip$ | async)?.width"
                    [style.height.px]="(tableLayerService.tableIconTooltip$ | async)?.height"
                    [title]="'Rows: ' + ((tableLayerService.tableIconTooltip$ | async)?.rows ?? 0) + ', Columns: ' + ((tableLayerService.tableIconTooltip$ | async)?.columns ?? 0)"
                    (click)="tableLayerService.handleTableIconClick()"
                >
                    <div class="tooltip-container"></div>
                </div>
            </div>

            <!-- Table View Modal -->
            <app-table-view
                [tableToView]="(tableLayerService.tableToView$ | async)?.table ?? null"
                (handleTableViewClose)="tableLayerService.handleTableViewClose()"
            ></app-table-view>

            <!-- Inline Label Menu -->
            <app-inline-label-menu
                [showPopup]="(labelService.inlineLabelMenu$ | async)?.showPopup ?? false"
                [positionTop]="(labelService.inlineLabelMenu$ | async)?.positionTop ?? 0"
                [positionLeft]="(labelService.inlineLabelMenu$ | async)?.positionLeft ?? 0"
                [enabledTypes]="(labelService.inlineLabelMenu$ | async)?.enabledTypes ?? []"
            ></app-inline-label-menu>

            <!-- Delete Drawn Region Icon -->
            <div
                *ngIf="(labelService.deleteRegionIcon$ | async)?.show"
                class="delete-region-icon"
                [style.top.px]="(labelService.deleteRegionIcon$ | async)?.top"
                [style.left.px]="(labelService.deleteRegionIcon$ | async)?.left"
                (mouseenter)="labelService.onDeleteRegionIconMouseEnter()"
                (mouseleave)="labelService.onDeleteRegionIconMouseLeave()"
                (click)="labelService.clearDrawnRegion()"
            >
                <i class="pi pi-times-circle"></i>
            </div>
            <div class="label-canvas-control-bar">
                <div class="label-canvas-page-control">
                    <app-page-control
                        [disabled]="isButtonDisabled"
                        [currentPage]="currentDocument?.currentPage"
                        [numPages]="currentDocument?.numPages"
                        (onPageChange)="goToPage($event)"
                        (onPreviousClick)="previousPage()"
                        (onNextClick)="nextPage()"
                    ></app-page-control>
                </div>
                <div class="label-canvas-tool-bar">
                    <app-image-map-toolbar
                        [disabled]="isButtonDisabled"
                        [zoomRatio]="zoomRatio"
                        [rotateAngle]="canvas?.angle || 0"
                        (onZoomInClick)="handleImageZoomIn()"
                        (onZoomOutClick)="handleImageZoomOut()"
                        (onZoomToFitClick)="handleImageZoomToFit()"
                        (onRotateClick)="handleImageRotate()"
                    ></app-image-map-toolbar>
                </div>
            </div>
        </div>
    `,
    styleUrls: ["./label-canvas.component.scss"],
})
export class LabelCanvasComponent implements OnInit, OnDestroy {
    @Input() allowDrawRegion: boolean = true;

    currentDocument: IDocument | null = null;
    canvas: ICanvas | null = null;

    progress: number | undefined = undefined;
    layerCheckStates: ILayerCheckStates = {
        text: true,
        tables: true,
        selectionMarks: true,
    };
    drawRegionMode: boolean = false;
    zoomRatio: number | undefined = undefined;
    isAnalyzing: boolean = false;
    isButtonDisabled: boolean = true;

    featureStyler = defaultStyler;

    private imageMap: ImageMapComponent | null = null;
    private destroy$ = new Subject<void>();

    constructor(
        private store: Store,
        public ocrLayerService: OcrLayerService,
        public tableLayerService: TableLayerService,
        public labelService: CustomModelLabelService
    ) {}

    ngOnInit(): void {
        this.store
            .select(selectCurrentDocument)
            .pipe(
                takeUntil(this.destroy$),
                startWith(null as IDocument | null),
                pairwise()
            )
            .subscribe(([prev, current]) => {
                this.currentDocument = current;
                this.updateDerivedState();

                if (prev !== current) {
                    this.progress = 0;
                    setTimeout(() => (this.progress = undefined), 0);
                }
            });

        this.store
            .select(selectCanvas)
            .pipe(takeUntil(this.destroy$))
            .subscribe((canvas) => {
                this.canvas = canvas;
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.ocrLayerService.destroy();
        this.tableLayerService.destroy();
        this.labelService.destroy();
    }

    // Page Control
    goToPage(page: number): void {
        this.store.dispatch(setCurrentPage({ pageNumber: page }));
    }

    previousPage(): void {
        if (this.currentDocument) {
            this.store.dispatch(
                setCurrentPage({ pageNumber: this.currentDocument.currentPage - 1 })
            );
        }
    }

    nextPage(): void {
        if (this.currentDocument) {
            this.store.dispatch(
                setCurrentPage({ pageNumber: this.currentDocument.currentPage + 1 })
            );
        }
    }

    // ImageMap ref
    onSetImageMap(imageMap: ImageMapComponent): void {
        this.imageMap = imageMap;
        // Initialize all layer services with the image map reference
        this.ocrLayerService.initialize(imageMap);
        this.tableLayerService.initialize(imageMap);
        this.labelService.initialize(imageMap);
    }

    onMapReady(): void {
        // Map is ready - services are already initialized via onSetImageMap
    }

    // Feature interaction handlers
    onFeatureSelect(event: { feature: any; isToggle: boolean; category: any }): void {
        this.labelService.handleFeatureSelect(event.feature, event.isToggle, event.category);
    }

    onFinishFeatureSelect(): void {
        this.labelService.handleFinishFeatureSelect();
    }

    onTableToolTipChange(event: any): void {
        this.tableLayerService.handleTableToolTipChange(
            event.display,
            event.width,
            event.height,
            event.top,
            event.left,
            event.rows,
            event.columns,
            event.featureId
        );
    }

    onDrawnRegionFeature(feature: any): void {
        this.labelService.handleRegionDrawn(feature);
    }

    onFeatureModify(event: any): void {
        this.labelService.handleFeatureModify(event.features || [event]);
    }

    onDrawnRegionHovered(event: any): void {
        this.labelService.handleDrawnRegionFeatureHovered(event.originalEvent, event.features || []);
    }

    // Zoom / Rotate
    handleImageZoomIn(): void {
        this.imageMap?.zoomIn();
        this.zoomRatio = this.imageMap?.getZoom();
    }

    handleImageZoomOut(): void {
        this.imageMap?.zoomOut();
        this.zoomRatio = this.imageMap?.getZoom();
    }

    handleImageZoomToFit(): void {
        this.imageMap?.resetZoom();
        this.imageMap?.resetCenter();
    }

    handleImageRotate(): void {
        if (this.canvas && this.canvas.angle >= 0) {
            const newAngle = (this.canvas.angle + 90) % 360;
            this.store.dispatch(setAngle({ angle: newAngle }));
        }
    }

    // Layer filter
    handleLayerFilterChange(item: ILayerFilterItem): void {
        const featureVisibility = item.checked;
        switch (item.key) {
            case "text":
                this.imageMap?.toggleTextFeatureVisibility(featureVisibility);
                break;
            case "tables":
                this.imageMap?.toggleTableFeatureVisibility(featureVisibility);
                break;
            case "selectionMarks":
                this.imageMap?.toggleCheckboxFeatureVisibility(featureVisibility);
                break;
        }

        this.layerCheckStates = {
            ...this.layerCheckStates,
            [item.key]: featureVisibility,
        };
    }

    // Draw region
    handleDrawRegion(): void {
        this.drawRegionMode = !this.drawRegionMode;
    }

    private updateDerivedState(): void {
        this.isAnalyzing =
            this.currentDocument?.states.analyzingStatus === DocumentStatus.Analyzing;
        this.isButtonDisabled = this.isAnalyzing || !this.currentDocument;
    }
}
