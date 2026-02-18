import {
    Component,
    Input,
    Output,
    EventEmitter,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnChanges,
    SimpleChanges,
    OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Feature, MapBrowserEvent, View } from "ol";
import Collection from "ol/Collection";
import { Coordinate } from "ol/coordinate";
import { never, shiftKeyOnly } from "ol/events/condition";
import { Extent, getCenter } from "ol/extent";
import { FeatureLike } from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { defaults as defaultInteractions, DragBox, DragPan, Interaction, Modify, Snap } from "ol/interaction";
import Draw, { DrawEvent } from "ol/interaction/Draw";
import PointerInteraction from "ol/interaction/Pointer";
import Map from "ol/Map";
import Projection from "ol/proj/Projection";
import VectorSource from "ol/source/Vector";
import Style from "ol/style/Style";
import {
    CHECKBOX_VECTOR_LAYER_NAME,
    DRAWN_REGION_LABEL_VECTOR_LAYER_NAME,
    DRAWN_REGION_VECTOR_LAYER_NAME,
    IMAGE_LAYER_NAME,
    LABEL_VECTOR_LAYER_NAME,
    POD_VECTOR_LAYER_NAME,
    TABLE_BORDER_VECTOR_LAYER_NAME,
    TABLE_ICON_BORDER_VECTOR_LAYER_NAME,
    TABLE_ICON_VECTOR_LAYER_NAME,
    TEXT_VECTOR_LAYER_NAME,
} from "./constants";
import { FeatureCategory, IRegion } from "./contracts";
import { degreeToRadians, makeImageLayer, makeImageSource, makeLayerFilter, makeVectorLayer } from "./utils";

@Component({
    selector: "app-image-map",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="map-wrapper"
            (mouseleave)="handlePointerLeaveImageMap()"
            (mouseenter)="handlePointerEnterImageMap()"
        >
            <div [style.cursor]="getCursor()" id="map" #mapElement></div>
        </div>
    `,
    styleUrls: ["./image-map.component.scss"],
})
export class ImageMapComponent implements AfterViewInit, OnChanges, OnDestroy {
    @ViewChild("mapElement") mapElementRef!: ElementRef<HTMLDivElement>;

    @Input() imageUri: string = "";
    @Input() imageWidth: number = 0;
    @Input() imageHeight: number = 0;
    @Input() imageAngle?: number;

    @Input() featureStyler?: (feature: any) => Style;
    @Input() tableBorderFeatureStyler?: (feature: any) => Style;
    @Input() tableIconFeatureStyler?: (feature: any, resolution: number) => Style;
    @Input() tableIconBorderFeatureStyler?: (feature: any) => Style;
    @Input() checkboxFeatureStyler?: (feature: any) => Style;
    @Input() podFeatureStyler?: (feature: any) => Style;
    @Input() labelFeatureStyler?: (feature: any) => Style;
    @Input() drawRegionStyler?: (feature: any) => Style;
    @Input() drawnRegionStyler?: (feature: any) => Style;
    @Input() modifyStyler?: (feature: any, resolution: number) => Style;

    @Input() initEditorMap?: boolean;
    @Input() initPredictMap?: boolean;
    @Input() initLayoutMap?: boolean;

    @Input() enableFeatureSelection?: boolean;
    @Input() groupSelectMode?: boolean;
    @Input() drawRegionMode?: boolean;
    @Input() isPointerOnImage?: boolean;
    @Input() isSnapped?: boolean;
    @Input() isVertexDragging?: boolean;
    @Input() isDrawing?: boolean;
    @Input() hoveringFeature?: string;

    @Output() onMapReady = new EventEmitter<void>();
    @Output() handleFeatureSelect = new EventEmitter<{ feature: any; isToggle: boolean; category: FeatureCategory }>();
    @Output() handleFeatureDoubleClick = new EventEmitter<{ feature: any; isToggle: boolean; category: FeatureCategory }>();
    @Output() handleIsPointerOnImage = new EventEmitter<boolean>();
    @Output() handleFeatureSelectByGroup = new EventEmitter<any>();
    @Output() handleRegionSelectByGroup = new EventEmitter<IRegion[]>();
    @Output() onFinishFeatureSelect = new EventEmitter<void>();
    @Output() handleTableToolTipChange = new EventEmitter<any>();
    @Output() onLabelFeatureHovered = new EventEmitter<any>();
    @Output() onOcrFeatureHovered = new EventEmitter<any>();
    @Output() onPodFeatureHovered = new EventEmitter<any>();
    @Output() onCheckboxFeatureHovered = new EventEmitter<any>();
    @Output() onDrawnRegionFeatureHovered = new EventEmitter<any>();
    @Output() addDrawnRegionFeatureProps = new EventEmitter<Feature>();
    @Output() updateFeatureAfterModify = new EventEmitter<any>();
    @Output() handleDrawing = new EventEmitter<boolean>();
    @Output() handleVertexDrag = new EventEmitter<boolean>();
    @Output() handleIsSnapped = new EventEmitter<boolean>();
    @Output() setImageMap = new EventEmitter<ImageMapComponent>();

    private map!: Map;
    private imageLayer: any;
    private textLayer: any;
    private podLayer: any;
    private tableBorderLayer: any;
    private tableIconLayer: any;
    private tableIconBorderLayer: any;
    private checkboxLayer: any;
    private labelLayer: any;
    private drawnRegionLayer: any;
    private drawnLabelLayer: any;

    private dragPan!: DragPan;
    private draw!: Draw;
    private dragBox!: DragBox;
    private modify!: Modify;
    private snap!: Snap;

    private drawnFeatures: Collection<Feature> = new Collection([], { unique: true });
    public modifyStartFeatureCoordinates: any = {};

    private imageExtent: Extent = [0, 0, 0, 0];
    private isSwiping: boolean = false;

    private imageLayerFilter = makeLayerFilter(IMAGE_LAYER_NAME);
    private textLayerFilter = makeLayerFilter(TEXT_VECTOR_LAYER_NAME);
    private podLayerFilter = makeLayerFilter(POD_VECTOR_LAYER_NAME);
    private checkboxLayerFilter = makeLayerFilter(CHECKBOX_VECTOR_LAYER_NAME);
    private tableIconVectorLayerFilter = makeLayerFilter(TABLE_ICON_VECTOR_LAYER_NAME);
    private tableBorderVectorLayerFilter = makeLayerFilter(TABLE_BORDER_VECTOR_LAYER_NAME);
    private labelVectorLayerFilter = makeLayerFilter(LABEL_VECTOR_LAYER_NAME);
    private drawnLabelVectorLayerFilter = makeLayerFilter(DRAWN_REGION_LABEL_VECTOR_LAYER_NAME);
    private drawnRegionVectorLayerFilter = makeLayerFilter(DRAWN_REGION_VECTOR_LAYER_NAME);

    private hasFeatureSelectedByPointer: boolean = false;
    private prevImageUri: string = "";
    private prevImageAngle?: number;

    ngAfterViewInit() {
        // Delay initialization to ensure the container has been laid out and has dimensions
        setTimeout(() => {
            this.imageExtent = [0, 0, this.imageWidth, this.imageHeight];
            if (this.initEditorMap) {
                this.initEditor();
            } else if (this.initPredictMap) {
                this.initPredict();
            } else if (this.initLayoutMap) {
                this.initLayout();
            }
            this.setImageMap.emit(this);
            this.onMapReady.emit();
            this.prevImageUri = this.imageUri;
            this.prevImageAngle = this.imageAngle;
        }, 0);
    }

    ngOnChanges(changes: SimpleChanges) {
        if (!this.map) return;

        if (changes["imageUri"] || changes["imageAngle"]) {
            if (this.imageUri !== this.prevImageUri || this.imageAngle !== this.prevImageAngle) {
                this.imageExtent = [0, 0, this.imageWidth, this.imageHeight];
                this.setImage(this.imageUri, this.imageExtent);
                this.updateSize();
                this.prevImageUri = this.imageUri;
                this.prevImageAngle = this.imageAngle;
            }
        }
    }

    ngOnDestroy() {
        if (this.map) {
            this.map.setTarget(undefined);
        }
    }

    // Public methods for layer manipulation
    public getImageExtent = () => this.imageExtent;

    public addFeatures = (features: Feature[]) => this.textLayer?.getSource().addFeatures(features);
    public addCheckboxFeatures = (features: Feature[]) => this.checkboxLayer?.getSource().addFeatures(features);
    public addLabelFeatures = (features: Feature[]) => this.labelLayer?.getSource().addFeatures(features);
    public addTableBorderFeatures = (features: Feature[]) => this.tableBorderLayer?.getSource().addFeatures(features);
    public addTableIconFeatures = (features: Feature[]) => this.tableIconLayer?.getSource().addFeatures(features);
    public addDrawnRegionFeatures = (features: Feature[]) => this.drawnRegionLayer?.getSource().addFeatures(features);
    public addDrawnLabelFeatures = (features: Feature[]) => this.drawnLabelLayer?.getSource().addFeatures(features);

    public removeAllTextFeatures = () => this.textLayer?.getSource().clear();
    public removeAllCheckboxFeatures = () => this.checkboxLayer?.getSource().clear();
    public removeAllLabelFeatures = () => this.labelLayer?.getSource().clear();
    public removeAllTableBorderFeatures = () => this.tableBorderLayer?.getSource().clear();
    public removeAllTableIconFeatures = () => this.tableIconLayer?.getSource().clear();
    public removeAllDrawnRegionFeature = () => this.drawnRegionLayer?.getSource().clear();

    public getAllFeatures = () => this.textLayer?.getSource().getFeatures() || [];
    public getAllCheckboxFeatures = () => this.checkboxLayer?.getSource().getFeatures() || [];
    public getAllLabelFeatures = () => this.labelLayer?.getSource().getFeatures() || [];
    public getAllTableBorderFeatures = () => this.tableBorderLayer?.getSource().getFeatures() || [];
    public getAllTableIconFeatures = () => this.tableIconLayer?.getSource().getFeatures() || [];
    public getAllDrawnRegionFeatures = () => this.drawnRegionLayer?.getSource().getFeatures() || [];
    public getAllDrawnLabelFeatures = () => this.drawnLabelLayer?.getSource().getFeatures() || [];

    public getFeatureByID = (id: any) => this.textLayer?.getSource().getFeatureById(id);
    public getTableBorderFeatureByID = (id: any) => this.tableBorderLayer?.getSource().getFeatureById(id);
    public getTableIconFeatureByID = (id: any) => this.tableIconLayer?.getSource().getFeatureById(id);
    public getDrawnRegionFeatureByID = (id: any) => this.drawnRegionLayer?.getSource().getFeatureById(id);
    public getDrawnLabelFeatureByID = (id: any) => this.drawnLabelLayer?.getSource().getFeatureById(id);
    public getLabelFeatureByID = (id: any) => this.labelLayer?.getSource().getFeatureById(id);

    public removeDrawnRegionFeature = (feature: Feature) => {
        if (feature && this.getDrawnRegionFeatureByID(feature.getId())) {
            this.drawnRegionLayer.getSource().removeFeature(feature);
        }
    };

    public clearDrawnRegions = () => {
        this.drawnRegionLayer?.getSource().clear();
        this.drawnLabelLayer?.getSource().clear();

        this.drawnFeatures = new Collection([], { unique: true });

        this.drawnRegionLayer?.getSource().on("addfeature", (evt: any) => {
            this.pushToDrawnFeatures(evt.feature!, this.drawnFeatures);
        });
        this.drawnRegionLayer?.getSource().on("removefeature", (evt: any) => {
            this.removeFromDrawnFeatures(evt.feature!, this.drawnFeatures);
        });
        this.drawnLabelLayer?.getSource().on("addfeature", (evt: any) => {
            this.pushToDrawnFeatures(evt.feature!, this.drawnFeatures);
        });
        this.drawnLabelLayer?.getSource().on("removefeature", (evt: any) => {
            this.removeFromDrawnFeatures(evt.feature!, this.drawnFeatures);
        });

        this.removeInteraction(this.snap);
        this.initializeSnap();
        this.addInteraction(this.snap);
        this.removeInteraction(this.modify);
        this.initializeModify();
        this.addInteraction(this.modify);
    };

    public toggleTextFeatureVisibility = (visible: boolean = false) => this.textLayer?.setVisible(visible || !this.textLayer.getVisible());
    public toggleTableFeatureVisibility = (visible: boolean = false) => {
        this.tableBorderLayer?.setVisible(visible || !this.tableBorderLayer.getVisible());
        this.tableIconLayer?.setVisible(visible || !this.tableIconLayer.getVisible());
        this.tableIconBorderLayer?.setVisible(visible || !this.tableIconBorderLayer.getVisible());
    };
    public toggleCheckboxFeatureVisibility = (visible: boolean = false) => this.checkboxLayer?.setVisible(visible || !this.checkboxLayer.getVisible());

    public getCoordinatePixelPosition = (coordinate?: Coordinate) => {
        if (!coordinate) return [0, 0];
        return this.map.getPixelFromCoordinate(coordinate);
    };

    public zoomIn = () => this.map?.getView().setZoom((this.map.getView().getZoom() || 0) + 0.3);
    public zoomOut = () => this.map?.getView().setZoom((this.map.getView().getZoom() || 0) - 0.3);
    public getZoom = () => this.map?.getView().getZoom();
    public resetZoom = () => this.map?.getView().setZoom(0);
    public resetCenter = () => this.map?.getView().setCenter(getCenter(this.imageExtent));
    public updateSize = () => this.map?.updateSize();

    public addInteraction = (interaction: Interaction) => {
        if (!this.map) return;
        const exists = this.map.getInteractions().getArray().find((i) => interaction.constructor === i.constructor);
        if (!exists) this.map.addInteraction(interaction);
    };

    public removeInteraction = (interaction: Interaction) => {
        if (!this.map) return;
        const existing = this.map.getInteractions().getArray().find((i) => interaction.constructor === i.constructor);
        if (existing) this.map.removeInteraction(existing);
    };

    public cancelDrawing = () => {
        this.removeInteraction(this.draw);
        this.initializeDraw();
        this.addInteraction(this.draw);
    };

    public cancelModify = () => {
        Object.entries(this.modifyStartFeatureCoordinates).forEach(([id, coordStr]) => {
            let feature = this.getDrawnRegionFeatureByID(id);
            if (!feature) feature = this.getDrawnLabelFeatureByID(id);
            if (feature && (feature.getGeometry() as any).flatCoordinates.join(",") !== coordStr) {
                const oldFlat = (coordStr as string).split(",").map(parseFloat);
                const oldCoords: any[] = [];
                for (let i = 0; i < oldFlat.length; i += 2) {
                    oldCoords.push([oldFlat[i], oldFlat[i + 1]]);
                }
                (feature.getGeometry() as Polygon).setCoordinates([oldCoords]);
            }
        });
        this.modifyStartFeatureCoordinates = {};
        this.removeInteraction(this.modify);
        this.initializeModify();
        this.addInteraction(this.modify);
        this.handleIsSnapped.emit(false);
    };

    public getFeaturesInExtent = (extent: Extent): Feature[] => {
        const features: Feature[] = [];
        this.textLayer?.getSource().forEachFeatureInExtent(extent, (f: Feature) => features.push(f));
        return features;
    };

    getCursor(): string {
        if (this.initEditorMap) {
            if (this.isVertexDragging) return "grabbing";
            if (this.isSnapped) return "grab";
            if (this.groupSelectMode || this.drawRegionMode) {
                return this.isPointerOnImage ? "crosshair" : "default";
            }
        }
        return "default";
    }

    handlePointerLeaveImageMap() {
        if (!this.map) return;
        if (this.initEditorMap || this.initLayoutMap) {
            if (this.isDrawing) this.cancelDrawing();
            this.handleIsPointerOnImage.emit(false);
        }
    }

    handlePointerEnterImageMap() {
        if (!this.map) return;
        this.setDragPanInteraction(true);
    }

    // Private initialization methods
    private initEditor() {
        const projection = this.createProjection(this.imageExtent);
        const layers = this.initializeEditorLayers(projection);
        this.initializeMap(projection, layers);
        this.map.on("pointerdown" as any, (e: any) => this.handlePointerDown(e));
        this.map.on("pointermove", (e: any) => this.handlePointerMove(e));
        this.map.on("pointermove", (e: any) => this.handlePointerMoveOnFeatures(e));
        this.map.on("pointerup" as any, () => this.handlePointerUp());
        this.map.on("dblclick", (e: any) => this.handleDoubleClick(e));
        this.initializeDefaultSelectionMode();
        this.initializeDragPan();
    }

    private initPredict() {
        const projection = this.createProjection(this.imageExtent);
        const layers = this.initializePredictLayers(projection);
        this.initializeMap(projection, layers);
        this.initializeDragPan();
    }

    private initLayout() {
        const projection = this.createProjection(this.imageExtent);
        const layers = this.initializeEditorLayers(projection);
        this.initializeMap(projection, layers);
        this.map.on("pointerdown" as any, (e: any) => this.handlePointerDown(e));
        this.map.on("pointermove", (e: any) => this.handlePointerMove(e));
        this.map.on("pointermove", (e: any) => this.handlePointerMoveOnFeatures(e));
        this.map.on("pointerup" as any, () => this.handlePointerUp());
        this.map.on("dblclick", (e: any) => this.handleDoubleClick(e));
        this.initializeDefaultSelectionMode();
        this.initializeDragPan();
    }

    private setImage(imageUri: string, imageExtent: Extent) {
        const projection = this.createProjection(imageExtent);
        this.imageLayer.setSource(makeImageSource(imageUri, projection, imageExtent));
        this.map.setView(this.createMapView(projection, imageExtent));
    }

    private createProjection(imageExtent: Extent) {
        return new Projection({ code: "xkcd-image", units: "pixels", extent: imageExtent });
    }

    private createMapView(projection: Projection, imageExtent: Extent) {
        const minZoom = this.getMinimumZoom();
        const rotation = this.imageAngle ? degreeToRadians((this.imageAngle + 360) % 360) : 0;
        return new View({ projection, center: getCenter(imageExtent), rotation, zoom: minZoom, minZoom });
    }

    private getMinimumZoom(): number {
        const el = this.mapElementRef?.nativeElement;
        if (!el) return 0;
        const containerAspectRatio = el.clientHeight / el.clientWidth;
        const imageAspectRatio = this.imageHeight / this.imageWidth;
        if (imageAspectRatio > containerAspectRatio) {
            return Math.LOG2E * Math.log(el.clientHeight / 256);
        } else {
            return Math.LOG2E * Math.log(el.clientWidth / 256);
        }
    }

    private handlePointerDown(event: MapBrowserEvent<UIEvent>) {
        if (this.isSnapped && this.handleVertexDrag) {
            this.handleVertexDrag.emit(true);
            return;
        }
        if (!this.enableFeatureSelection) return;

        const eventPixel = this.map.getEventPixel(event.originalEvent);
        const filter = this.getLayerFilterAtPixel(eventPixel);
        const isPixelOnFeature = !!filter && filter.layerfilter !== this.podLayerFilter;
        if (isPixelOnFeature && !this.isSnapped) {
            this.setDragPanInteraction(false);
        }

        if (filter && this.handleFeatureSelect.observed) {
            this.map.forEachFeatureAtPixel(eventPixel, (feature) => {
                this.handleFeatureSelect.emit({ feature, isToggle: true, category: filter.category });
            }, filter.layerfilter);
        }

        this.hasFeatureSelectedByPointer = isPixelOnFeature && this.handleFeatureSelect.observed;
    }

    private handlePointerMove(event: MapBrowserEvent<UIEvent>) {
        if (!this.enableFeatureSelection || !this.isSwiping) return;
        event.preventDefault();
        const eventPixel = this.map.getEventPixel(event.originalEvent);
        this.map.forEachFeatureAtPixel(eventPixel, (feature) => {
            this.handleFeatureSelect.emit({ feature, isToggle: false, category: FeatureCategory.Text });
            this.hasFeatureSelectedByPointer = true;
        }, this.textLayerFilter);
    }

    private handlePointerMoveOnFeatures(event: MapBrowserEvent<UIEvent>) {
        const eventPixel = this.map.getEventPixel(event.originalEvent);

        // Table tooltip
        if (this.handleTableToolTipChange.observed) {
            const isOnTableIcon = this.map.hasFeatureAtPixel(eventPixel, this.tableIconVectorLayerFilter);
            if (isOnTableIcon) {
                const features = this.map.getFeaturesAtPixel(eventPixel, this.tableIconVectorLayerFilter);
                if (features.length > 0) {
                    const feature = features[0];
                    if (feature && this.hoveringFeature !== feature.get("id")) {
                        const geometry = feature.getGeometry() as Point;
                        const coords = geometry.getCoordinates();
                        const topRight = this.map.getPixelFromCoordinate(coords);
                        this.handleTableToolTipChange.emit({
                            display: "block", width: 20, height: 20,
                            top: topRight[1], left: topRight[0] - 20,
                            rows: feature.get("rows"), columns: feature.get("columns"),
                            featureId: feature.get("id"),
                        });
                    }
                }
            } else if (this.hoveringFeature !== null) {
                this.handleTableToolTipChange.emit({ display: "none", width: 0, height: 0, top: 0, left: 0, rows: 0, columns: 0, featureId: null });
            }
        }

        // Label feature hover
        if (this.onLabelFeatureHovered.observed) {
            const isOnLabel = this.map.hasFeatureAtPixel(eventPixel, this.labelVectorLayerFilter);
            const isOnTableBorder = this.map.hasFeatureAtPixel(eventPixel, this.tableBorderVectorLayerFilter);
            if (isOnLabel) {
                const features = this.map.getFeaturesAtPixel(eventPixel, this.labelVectorLayerFilter);
                this.onLabelFeatureHovered.emit({ originalEvent: event.originalEvent, features });
                if (this.handleTableToolTipChange.observed && isOnTableBorder) {
                    const tableBorderFeatures = this.map.getFeaturesAtPixel(eventPixel, this.tableBorderVectorLayerFilter);
                    this.handleTableToolTipChange.emit({
                        display: "none", width: 0, height: 0, top: 0, left: 0, rows: 0, columns: 0,
                        featureId: tableBorderFeatures[0].get("id"),
                    });
                }
            } else {
                this.onLabelFeatureHovered.emit({ originalEvent: event.originalEvent, features: [] });
            }
        }

        // OCR feature hover
        if (this.onOcrFeatureHovered.observed) {
            const isOnText = this.map.hasFeatureAtPixel(eventPixel, this.textLayerFilter);
            const isOnCheckbox = this.map.hasFeatureAtPixel(eventPixel, this.checkboxLayerFilter);
            if (isOnText) {
                const features = this.map.getFeaturesAtPixel(eventPixel, this.textLayerFilter);
                this.onOcrFeatureHovered.emit({ originalEvent: event.originalEvent, features });
            } else if (isOnCheckbox) {
                const features = this.map.getFeaturesAtPixel(eventPixel, this.checkboxLayerFilter);
                this.onOcrFeatureHovered.emit({ originalEvent: event.originalEvent, features });
            } else {
                this.onOcrFeatureHovered.emit({ originalEvent: event.originalEvent, features: [] });
            }
        }

        // Pod feature hover
        if (this.onPodFeatureHovered.observed) {
            const isOnPod = this.map.hasFeatureAtPixel(eventPixel, this.podLayerFilter);
            if (isOnPod) {
                const features = this.map.getFeaturesAtPixel(eventPixel, this.podLayerFilter);
                this.onPodFeatureHovered.emit({ originalEvent: event.originalEvent, features });
            } else {
                this.onPodFeatureHovered.emit({ originalEvent: event.originalEvent, features: [] });
            }
        }

        // Drawn region hover
        if (this.onDrawnRegionFeatureHovered.observed) {
            const isOnDrawRegion = this.map.hasFeatureAtPixel(eventPixel, this.drawnRegionVectorLayerFilter);
            if (isOnDrawRegion) {
                const features = this.map.getFeaturesAtPixel(eventPixel, this.drawnRegionVectorLayerFilter);
                this.onDrawnRegionFeatureHovered.emit({ originalEvent: event.originalEvent, features });
            } else {
                this.onDrawnRegionFeatureHovered.emit({ originalEvent: event.originalEvent, features: [] });
            }
        }
    }

    private handlePointerUp() {
        if (this.isDrawing) { this.handleDrawing.emit(false); return; }
        if (this.isVertexDragging) { this.handleVertexDrag.emit(false); return; }
        if (!this.enableFeatureSelection) return;

        this.setDragPanInteraction(true);
        this.removeInteraction(this.modify);
        this.initializeModify();
        this.addInteraction(this.modify);

        if (this.hasFeatureSelectedByPointer) {
            this.onFinishFeatureSelect.emit();
        }
    }

    private handleDoubleClick(event: MapBrowserEvent<UIEvent>) {
        const eventPixel = this.map.getEventPixel(event.originalEvent);
        const filter = this.getLayerFilterAtPixel(eventPixel);
        if (filter && this.handleFeatureDoubleClick.observed) {
            this.map.forEachFeatureAtPixel(eventPixel, (feature) => {
                this.handleFeatureDoubleClick.emit({ feature, isToggle: true, category: filter.category });
            }, filter.layerfilter);
        }
    }

    private getLayerFilterAtPixel(eventPixel: any): { layerfilter: any; category: FeatureCategory } | null {
        if (this.map.hasFeatureAtPixel(eventPixel, this.labelVectorLayerFilter))
            return { layerfilter: this.labelVectorLayerFilter, category: FeatureCategory.Label };
        if (this.map.hasFeatureAtPixel(eventPixel, this.checkboxLayerFilter))
            return { layerfilter: this.checkboxLayerFilter, category: FeatureCategory.Checkbox };
        if (this.map.hasFeatureAtPixel(eventPixel, this.textLayerFilter))
            return { layerfilter: this.textLayerFilter, category: FeatureCategory.Text };
        if (this.map.hasFeatureAtPixel(eventPixel, this.podLayerFilter))
            return { layerfilter: this.podLayerFilter, category: FeatureCategory.Label };
        if (this.map.hasFeatureAtPixel(eventPixel, this.drawnRegionVectorLayerFilter))
            return { layerfilter: this.drawnRegionVectorLayerFilter, category: FeatureCategory.DrawnRegion };
        if (this.map.hasFeatureAtPixel(eventPixel, this.drawnLabelVectorLayerFilter))
            return { layerfilter: this.drawnLabelVectorLayerFilter, category: FeatureCategory.DrawnRegion };
        return null;
    }

    private setDragPanInteraction(enabled: boolean) {
        if (enabled) { this.addInteraction(this.dragPan); this.isSwiping = false; }
        else { this.removeInteraction(this.dragPan); this.isSwiping = true; }
    }

    private initializeDefaultSelectionMode() {
        this.initializeSnapCheck();
        this.initializePointerOnImageCheck();
        this.initializeDragBox();
        this.initializeModify();
        this.initializeSnap();
        this.initializeDraw();
        this.addInteraction(this.dragBox);
        this.addInteraction(this.modify);
        this.addInteraction(this.snap);
    }

    private initializeDraw() {
        const boundingExtent = (coords: any[]) => {
            const ext = [Infinity, Infinity, -Infinity, -Infinity];
            coords.forEach((c: number[]) => {
                if (c[0] < ext[0]) ext[0] = c[0];
                if (c[0] > ext[2]) ext[2] = c[0];
                if (c[1] < ext[1]) ext[1] = c[1];
                if (c[1] > ext[3]) ext[3] = c[1];
            });
            return ext;
        };

        this.draw = new Draw({
            type: "Circle" as any,
            source: this.drawnRegionLayer?.getSource(),
            style: this.drawRegionStyler,
            geometryFunction: (coordinates, optGeometry) => {
                const extent = boundingExtent(coordinates as any);
                const boxCoords = [[[extent[0], extent[3]], [extent[2], extent[3]], [extent[2], extent[1]], [extent[0], extent[1]]]];
                let geometry = optGeometry;
                if (geometry) { geometry.setCoordinates(boxCoords); } else { geometry = new Polygon(boxCoords); }
                return geometry;
            },
            stopClick: true,
            freehand: true,
        });

        this.draw.on("drawstart", () => this.handleDrawing.emit(true));
        this.draw.on("drawend", (e: DrawEvent) => this.addDrawnRegionFeatureProps.emit(e.feature));
    }

    private initializeModify() {
        this.modify = new Modify({
            deleteCondition: never,
            insertVertexCondition: never,
            style: this.modifyStyler,
            features: this.drawnFeatures,
        });

        (this.modify as any).handleUpEvent_old = (this.modify as any).handleUpEvent;
        (this.modify as any).handleUpEvent = function (evt: any) {
            try { this.handleUpEvent_old(evt); } catch (ex) { /* noop */ }
        };

        this.modify.on("modifystart", (e) => {
            e.features.getArray().forEach((f) => {
                let coords: any[] = [];
                (f.getGeometry() as Polygon).getCoordinates()[0].forEach((c) => { coords.push(c[0]); coords.push(c[1]); });
                this.modifyStartFeatureCoordinates[f.getId()!] = coords.join(",");
            });
        });

        this.modify.on("modifyend", (e) => this.updateFeatureAfterModify.emit(e.features.getArray()));
    }

    private initializeSnap() {
        this.snap = new Snap({ edge: false, vertex: true, features: this.drawnFeatures });
    }

    private initializeDragPan() {
        this.dragPan = new DragPan();
        this.setDragPanInteraction(true);
    }

    private initializeDragBox() {
        this.dragBox = new DragBox({ condition: shiftKeyOnly, className: "ol-dragbox-style" });
        this.dragBox.on("boxend", () => {
            const featureMap: Record<string, boolean> = {};
            const extent = this.dragBox.getGeometry().getExtent();
            const regionsToAdd: IRegion[] = [];

            if (this.labelLayer?.getVisible() && this.handleFeatureSelectByGroup.observed) {
                this.labelLayer.getSource().forEachFeatureInExtent(extent, (feature: Feature) => {
                    this.handleFeatureSelectByGroup.emit(feature);
                    featureMap[feature.get("id")] = true;
                });
            }
            if (this.textLayer?.getVisible() && this.handleFeatureSelectByGroup.observed) {
                this.textLayer.getSource().forEachFeatureInExtent(extent, (feature: Feature) => {
                    if (!Object.prototype.hasOwnProperty.call(featureMap, feature.get("id"))) {
                        this.handleFeatureSelectByGroup.emit(feature);
                    }
                });
            }
            if (this.checkboxLayer?.getVisible() && this.handleFeatureSelectByGroup.observed) {
                this.checkboxLayer.getSource().forEachFeatureInExtent(extent, (feature: Feature) => {
                    if (!Object.prototype.hasOwnProperty.call(featureMap, feature.get("id"))) {
                        this.handleFeatureSelectByGroup.emit(feature);
                    }
                });
            }

            if (this.onFinishFeatureSelect.observed) {
                this.onFinishFeatureSelect.emit();
            }
        });
    }

    private initializeSnapCheck() {
        const snapCheck = new Interaction({
            handleEvent: (evt: MapBrowserEvent<UIEvent>) => {
                if (!this.isVertexDragging) {
                    this.handleIsSnapped.emit(this.snap?.snapTo(evt.pixel, evt.coordinate, evt.map) !== null && !!this.isPointerOnImage);
                }
                return true;
            },
        });
        this.addInteraction(snapCheck);
    }

    private initializePointerOnImageCheck() {
        const check = new PointerInteraction({
            handleEvent: (evt: MapBrowserEvent<UIEvent>) => {
                const eventPixel = this.map.getEventPixel(evt.originalEvent);
                const test = this.map.forEachLayerAtPixel(eventPixel, () => true, this.imageLayerFilter);
                if (!test && this.isPointerOnImage) this.handleIsPointerOnImage.emit(false);
                else if (!this.isPointerOnImage && Boolean(test)) this.handleIsPointerOnImage.emit(true);
                return true;
            },
        });
        this.addInteraction(check);
    }

    private initializeEditorLayers(projection: Projection) {
        this.initializeImageLayer(projection);
        this.initializeTextLayer();
        this.initializeTableLayers();
        this.initializeCheckboxLayers();
        this.initializePodLayer();
        this.initializeLabelLayer();
        this.initializeDrawnRegionLabelLayer();
        this.initializeDrawnRegionLayer();
        return [this.imageLayer, this.textLayer, this.tableBorderLayer, this.tableIconBorderLayer,
                this.tableIconLayer, this.checkboxLayer, this.podLayer, this.drawnRegionLayer,
                this.labelLayer, this.drawnLabelLayer];
    }

    private initializePredictLayers(projection: Projection) {
        this.initializeImageLayer(projection);
        this.initializeTextLayer();
        this.initializePodLayer();
        this.initializeLabelLayer();
        return [this.imageLayer, this.textLayer, this.labelLayer];
    }

    private initializeImageLayer(projection: Projection) {
        this.imageLayer = makeImageLayer(IMAGE_LAYER_NAME, this.imageUri, projection, this.imageExtent);
    }

    private initializeTextLayer() {
        this.textLayer = makeVectorLayer(TEXT_VECTOR_LAYER_NAME, { style: this.featureStyler });
    }

    private initializeTableLayers() {
        this.tableBorderLayer = makeVectorLayer(TABLE_BORDER_VECTOR_LAYER_NAME, { style: this.tableBorderFeatureStyler });
        this.tableIconLayer = makeVectorLayer(TABLE_ICON_VECTOR_LAYER_NAME, { style: this.tableIconFeatureStyler, updateWhileAnimating: true, updateWhileInteracting: true });
        this.tableIconBorderLayer = makeVectorLayer(TABLE_ICON_BORDER_VECTOR_LAYER_NAME, { style: this.tableIconBorderFeatureStyler });
    }

    private initializeCheckboxLayers() {
        this.checkboxLayer = makeVectorLayer(CHECKBOX_VECTOR_LAYER_NAME, { style: this.checkboxFeatureStyler });
    }

    private initializePodLayer() {
        this.podLayer = makeVectorLayer(POD_VECTOR_LAYER_NAME, { style: this.podFeatureStyler });
    }

    private initializeLabelLayer() {
        this.labelLayer = makeVectorLayer(LABEL_VECTOR_LAYER_NAME, { style: this.labelFeatureStyler });
    }

    private initializeDrawnRegionLayer() {
        const source = new VectorSource();
        source.on("addfeature", (evt) => this.pushToDrawnFeatures(evt.feature!));
        source.on("removefeature", (evt) => this.removeFromDrawnFeatures(evt.feature!));
        this.drawnRegionLayer = makeVectorLayer(DRAWN_REGION_VECTOR_LAYER_NAME, { style: this.drawnRegionStyler, source });
    }

    private initializeDrawnRegionLabelLayer() {
        const source = new VectorSource();
        source.on("addfeature", (evt) => { if (this.drawnLabelLayer?.getVisible()) this.pushToDrawnFeatures(evt.feature!); });
        source.on("removefeature", (evt) => this.removeFromDrawnFeatures(evt.feature!));
        this.drawnLabelLayer = makeVectorLayer(DRAWN_REGION_LABEL_VECTOR_LAYER_NAME, { style: this.labelFeatureStyler, source });
    }

    private pushToDrawnFeatures(feature: Feature, collection: Collection<Feature> = this.drawnFeatures) {
        if (collection.getArray().indexOf(feature) === -1) collection.push(feature);
    }

    private removeFromDrawnFeatures(feature: Feature, collection: Collection<Feature> = this.drawnFeatures) {
        if (collection.getArray().indexOf(feature) !== -1) collection.remove(feature);
    }

    private initializeMap(projection: Projection, layers: any[]) {
        this.map = new Map({
            controls: [],
            interactions: defaultInteractions({ shiftDragZoom: false, doubleClickZoom: false, pinchRotate: false }),
            target: this.mapElementRef.nativeElement,
            layers,
            view: this.createMapView(projection, this.imageExtent),
        });
    }
}
