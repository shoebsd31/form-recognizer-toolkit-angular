import { Injectable, OnDestroy } from "@angular/core";
import { Store } from "@ngrx/store";
import { BehaviorSubject, Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { Feature } from "ol";
import { Extent } from "ol/extent";
import Polygon from "ol/geom/Polygon";

import { ImageMapComponent } from "../components/image-map/image-map.component";
import { FeatureCategory } from "../components/image-map/contracts";
import { HIGHLIGHTED_PROPERTY, SELECTED_PROPERTY } from "../components/image-map/constants";
import { createRegionIdFromPolygon, getBoundingBoxFromFeatureId } from "../components/image-map/utils";
import { customLabelStyler, drawRegionStyler, modifyStyler } from "../utils/styler";
import { getColorByFieldKey, getFieldKeyFromLabel } from "../utils/custom-model";
// debounce is handled inline via setTimeout for timer handle compatibility
import { KeyEventCode, KeyEventType } from "../consts/constants";
import {
    Field,
    FieldType,
    Label,
    Labels,
    LabelType,
    LabelValueCandidate,
} from "../models/custom-models";
import {
    setLabelValueCandidates,
    updateLabel,
} from "../store/custom-model/custom-model.actions";
import {
    selectFields,
    selectLabels,
    selectColorForFields,
} from "../store/custom-model/custom-model.selectors";
import { selectHoveredLabelName } from "../store/canvas/canvas.selectors";
import { selectCurrentDocument } from "../store/documents/documents.selectors";
import { IDocument } from "../store/documents/documents.types";

/**
 * Supported field types for each feature category, used to determine
 * which field types appear in the inline label menu.
 */
const supportedFieldTypesByCategory: { [key: string]: FieldType[] } = {
    [FeatureCategory.Text]: [FieldType.String, FieldType.Date, FieldType.Time, FieldType.Integer, FieldType.Number],
    [FeatureCategory.Checkbox]: [FieldType.SelectionMark],
    [FeatureCategory.DrawnRegion]: [
        FieldType.String,
        FieldType.Date,
        FieldType.Time,
        FieldType.Integer,
        FieldType.Number,
        FieldType.SelectionMark,
        FieldType.Signature,
    ],
    [FeatureCategory.Label]: [
        FieldType.String,
        FieldType.Date,
        FieldType.Time,
        FieldType.Integer,
        FieldType.Number,
        FieldType.SelectionMark,
        FieldType.Signature,
    ],
};

export interface InlineLabelMenuState {
    showPopup: boolean;
    positionTop: number;
    positionLeft: number;
    enabledTypes: FieldType[];
}

export interface DeleteRegionIconState {
    show: boolean;
    top: number;
    left: number;
}

/** Default height for the inline label menu. */
const INLINE_LABEL_MENU_HEIGHT = 300;

@Injectable({ providedIn: "root" })
export class CustomModelLabelService implements OnDestroy {
    private imageMap: ImageMapComponent | null = null;
    private destroy$ = new Subject<void>();

    private selectedFeatures: Feature[] = [];
    private hoveredDrawRegionFeature: Feature | null = null;

    private mousePositionX: number = 0;
    private mousePositionY: number = 0;

    private readonly menuShiftX: number = -125;
    private readonly menuDownShiftY: number = 10;
    private readonly menuUpShiftY: number = -30;
    private readonly menuBottomOffset: number = 20;

    private readonly deleteIconBottomOffset: number = 20;
    private readonly deleteIconLeftOffset: number = -4;

    private ignoreOpenPopupFirstClick: boolean = false;
    private isDebouncing: boolean = false;
    private isHoveringOnDeleteRegionIcon: boolean = false;
    private deleteDrawnRegionDebouncer: ReturnType<typeof setTimeout> = setTimeout(() => {});

    private groupSelectMode: boolean = false;
    private isPointerOnImage: boolean = false;
    private isDrawing: boolean = false;
    private isVertexDragging: boolean = false;
    private isSnapped: boolean = false;

    // Store state
    private fields: Field[] = [];
    private labels: Labels = {};
    private colorForFields: Record<string, string>[] = [];
    private currentDocument: IDocument | null = null;
    private hoveredLabelName: string = "";
    private prevHoveredLabelName: string = "";

    private mapElement: HTMLElement | null = null;

    // Bound event handlers for removal in destroy
    private handleKeyDownBound = this.handleKeyDown.bind(this);
    private handleKeyUpBound = this.handleKeyUp.bind(this);
    private handleMouseMoveBound = this.handleMouseMove.bind(this);
    private handleClickBound = this.handleClick.bind(this);

    /**
     * Exposes stylers so the host component can bind them to ImageMap inputs.
     */
    public readonly labelFeatureStyler = customLabelStyler;
    public readonly drawRegionStyler = drawRegionStyler;
    public readonly drawnRegionStyler = drawRegionStyler;
    public readonly modifyStyler = modifyStyler;

    /**
     * Observable for inline label menu state (position, visibility, enabled types).
     */
    public inlineLabelMenu$ = new BehaviorSubject<InlineLabelMenuState>({
        showPopup: false,
        positionTop: 0,
        positionLeft: 0,
        enabledTypes: [],
    });

    /**
     * Observable for the delete region icon state (visibility, position).
     */
    public deleteRegionIcon$ = new BehaviorSubject<DeleteRegionIconState>({
        show: false,
        top: 0,
        left: 0,
    });

    /**
     * Observable that emits group select mode state.
     */
    public groupSelectMode$ = new BehaviorSubject<boolean>(false);

    /**
     * Observable that emits pointer-on-image state.
     */
    public isPointerOnImage$ = new BehaviorSubject<boolean>(false);

    /**
     * Observable that emits drawing state.
     */
    public isDrawing$ = new BehaviorSubject<boolean>(false);

    /**
     * Observable that emits vertex dragging state.
     */
    public isVertexDragging$ = new BehaviorSubject<boolean>(false);

    /**
     * Observable that emits snapped state.
     */
    public isSnapped$ = new BehaviorSubject<boolean>(false);

    constructor(private store: Store) {}

    /**
     * Initializes the service with a reference to the ImageMap component,
     * sets up DOM event listeners and subscribes to store state.
     */
    initialize(imageMap: ImageMapComponent): void {
        this.imageMap = imageMap;

        document.addEventListener(KeyEventType.KeyDown, this.handleKeyDownBound, true);
        document.addEventListener(KeyEventType.KeyUp, this.handleKeyUpBound, true);

        this.mapElement = document.getElementById("map");
        this.mapElement?.addEventListener("mousemove", this.handleMouseMoveBound);
        this.mapElement?.addEventListener("click", this.handleClickBound);

        // Subscribe to store
        this.store
            .select(selectFields)
            .pipe(takeUntil(this.destroy$))
            .subscribe((fields) => {
                this.fields = fields;
            });

        this.store
            .select(selectLabels)
            .pipe(takeUntil(this.destroy$))
            .subscribe((labels) => {
                const previous = this.labels;
                this.labels = labels;
                if (previous !== labels) {
                    this.handleLabelsChanged();
                }
            });

        this.store
            .select(selectColorForFields)
            .pipe(takeUntil(this.destroy$))
            .subscribe((colorForFields) => {
                const previous = this.colorForFields;
                this.colorForFields = colorForFields;
                if (previous !== colorForFields) {
                    this.handleLabelsChanged();
                }
            });

        this.store
            .select(selectCurrentDocument)
            .pipe(takeUntil(this.destroy$))
            .subscribe((currentDocument) => {
                const previous = this.currentDocument;
                this.currentDocument = currentDocument;
                if (previous !== currentDocument) {
                    this.handleLabelsChanged();
                }
            });

        this.store
            .select(selectHoveredLabelName)
            .pipe(takeUntil(this.destroy$))
            .subscribe((hoveredLabelName) => {
                this.prevHoveredLabelName = this.hoveredLabelName;
                this.hoveredLabelName = hoveredLabelName;
                if (this.prevHoveredLabelName !== hoveredLabelName) {
                    this.updateHoveredFeature(this.prevHoveredLabelName);
                }
            });
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    /**
     * Draws label features and drawn region features for the target page.
     */
    drawLabelFeatures(
        labels: Label[],
        colorForFields: Record<string, string>[],
        targetPage: number
    ): void {
        const imageExtent = this.imageMap?.getImageExtent() as Extent;
        const labelFeatures: Feature[] = [];
        const regionFeatures: Feature[] = [];

        const isRegionLabel = (label: Label): boolean =>
            !!label.labelType && label.labelType === LabelType.Region;

        labels.forEach((label) => {
            const color = this.getColorForLabel(label, colorForFields);
            if (isRegionLabel(label)) {
                label.value
                    .filter((v) => v.page === targetPage)
                    .forEach((value) => {
                        const { text, boundingBoxes } = value;
                        boundingBoxes.forEach((bbox) => {
                            regionFeatures.push(
                                this.makeFeature(
                                    text,
                                    bbox as unknown as number[],
                                    imageExtent,
                                    color,
                                    targetPage,
                                    label.label,
                                    FeatureCategory.DrawnRegion
                                )
                            );
                        });
                    });
            } else {
                label.value
                    .filter((v) => v.page === targetPage)
                    .forEach((value) => {
                        const { text, boundingBoxes } = value;
                        boundingBoxes.forEach((bbox) => {
                            labelFeatures.push(
                                this.makeFeature(
                                    text,
                                    bbox as unknown as number[],
                                    imageExtent,
                                    color,
                                    targetPage,
                                    label.label,
                                    FeatureCategory.Label
                                )
                            );
                        });
                    });
            }
        });

        if (labelFeatures.length > 0) {
            this.imageMap?.addLabelFeatures(labelFeatures);
        }

        if (regionFeatures.length > 0) {
            this.imageMap?.addDrawnRegionFeatures(regionFeatures);
        }
    }

    /**
     * Clears all label features and drawn region features from the map.
     */
    clearLabelFeatures(): void {
        this.imageMap?.removeAllLabelFeatures();
    }

    /**
     * Clears all drawn region features from the map.
     */
    clearRegionFeatures(): void {
        this.imageMap?.removeAllDrawnRegionFeature();
    }

    /**
     * Handles a feature being selected/toggled by the user.
     * Called by the host component when it receives handleFeatureSelect events.
     */
    handleFeatureSelect(feature: Feature, isToggle: boolean = true, category: FeatureCategory): void {
        const isSelected = this.isFeatureSelected(feature);
        if (isToggle && isSelected) {
            this.removeSelectedFeature(feature);
        } else if (!isSelected) {
            this.addSelectedFeature(feature);
        }
    }

    /**
     * Handles group selection of a feature (Shift+click).
     */
    handleFeatureSelectByGroup(feature: Feature): void {
        if (this.isFeatureSelected(feature)) {
            this.removeSelectedFeature(feature);
        } else {
            this.addSelectedFeature(feature);
        }
    }

    /**
     * Called when the pointer-up event finalizes a selection session.
     * Computes the inline label menu position and dispatches label value candidates.
     */
    handleFinishFeatureSelect(): void {
        this.store.dispatch(
            setLabelValueCandidates({
                candidates: this.selectedFeatures.map((f) => this.makeLabelValueCandidate(f)),
            })
        );
        this.setInlineLabelMenuHidden();

        if (this.selectedFeatures.length > 0) {
            this.ignoreOpenPopupFirstClick = true;
            const bottomPosition =
                this.mousePositionY + this.menuDownShiftY + INLINE_LABEL_MENU_HEIGHT + this.menuBottomOffset;
            const top =
                bottomPosition > document.body.offsetHeight
                    ? this.mousePositionY - INLINE_LABEL_MENU_HEIGHT + this.menuUpShiftY
                    : this.mousePositionY + this.menuDownShiftY;

            const enabledTypes = this.computeEnabledTypesForInlineMenu();

            this.inlineLabelMenu$.next({
                showPopup: true,
                positionLeft: this.mousePositionX + this.menuShiftX,
                positionTop: top,
                enabledTypes,
            });
        }
    }

    /**
     * Handles a newly drawn region feature.
     */
    handleRegionDrawn(feature: Feature): void {
        const featureCoordinates = this.getFeatureCoordinates(feature);
        const { featureId, boundingBox } = this.getFeatureIdAndBoundingBox(featureCoordinates);
        feature.setProperties({
            id: featureId,
            boundingbox: boundingBox,
            text: "",
            highlighted: false,
            isOcrProposal: false,
            page: this.currentDocument?.currentPage,
            category: FeatureCategory.DrawnRegion,
        });
        feature.setId(featureId);
        this.handleFeatureSelect(feature, false, FeatureCategory.DrawnRegion);
        this.handleFinishFeatureSelect();
    }

    /**
     * Handles modification of drawn region features (e.g., vertex drag).
     */
    async handleFeatureModify(features: Feature[]): Promise<void> {
        for (const feature of features) {
            const originalFeatureId = feature.getId();
            const featureCoordinates = (feature.getGeometry() as Polygon).getCoordinates()[0];
            if (this.imageMap?.modifyStartFeatureCoordinates[originalFeatureId as string] !== featureCoordinates.join(",")) {
                const { featureId, boundingBox } = this.getFeatureIdAndBoundingBox(featureCoordinates);
                const labelName = feature.get("alreadyAssignedLabelName");
                if (labelName) {
                    const oldCandidate = this.makeLabelValueCandidate(feature);
                    feature.setProperties({ id: featureId, boundingbox: boundingBox });
                    feature.setId(featureId);
                    const newCandidate = this.makeLabelValueCandidate(feature);
                    this.store.dispatch(updateLabel({ labelName, oldCandidate, newCandidate }));
                } else {
                    feature.setProperties({ id: featureId, boundingbox: boundingBox });
                    feature.setId(featureId);
                }
            }
        }

        if (this.imageMap) {
            this.imageMap.modifyStartFeatureCoordinates = {};
        }
    }

    /**
     * Handles the drawn region feature hover event for showing the delete icon.
     */
    handleDrawnRegionFeatureHovered(event: UIEvent, features: any[]): void {
        if (this.isSnapped) {
            return;
        }

        const feature = features[0];
        if (feature) {
            this.isHoveringOnDeleteRegionIcon = false;
            const { isLabelFeature } = feature.getProperties();
            if (isLabelFeature) {
                return;
            }
            clearTimeout(this.deleteDrawnRegionDebouncer);
            this.isDebouncing = false;
            this.hoveredDrawRegionFeature = feature;
            this.setDeleteRegionIconPosition(feature);
            this.deleteRegionIcon$.next({
                ...this.deleteRegionIcon$.value,
                show: true,
            });
        } else {
            if (!this.isDebouncing && !this.isHoveringOnDeleteRegionIcon && this.deleteRegionIcon$.value.show) {
                this.handleDeleteDrawnRegionDebouncer();
            }
        }
    }

    /**
     * Deletes the currently hovered drawn region.
     * Called when the user clicks the delete icon overlay.
     */
    clearDrawnRegion(): void {
        if (!this.hoveredDrawRegionFeature) {
            return;
        }
        this.imageMap?.removeDrawnRegionFeature(this.hoveredDrawRegionFeature);
        if (this.isFeatureSelected(this.hoveredDrawRegionFeature)) {
            this.removeSelectedFeature(this.hoveredDrawRegionFeature);
            this.store.dispatch(
                setLabelValueCandidates({
                    candidates: this.selectedFeatures.map((f) => this.makeLabelValueCandidate(f)),
                })
            );
        }

        this.setInlineLabelMenuHidden();
        this.deleteRegionIcon$.next({ show: false, top: 0, left: 0 });
        this.isHoveringOnDeleteRegionIcon = false;
        this.hoveredDrawRegionFeature = null;
    }

    /**
     * Notifies the service that the mouse has entered the delete region icon.
     */
    onDeleteRegionIconMouseEnter(): void {
        this.isHoveringOnDeleteRegionIcon = true;
        clearTimeout(this.deleteDrawnRegionDebouncer);
    }

    /**
     * Notifies the service that the mouse has left the delete region icon.
     */
    onDeleteRegionIconMouseLeave(): void {
        this.isHoveringOnDeleteRegionIcon = false;
        this.handleDeleteDrawnRegionDebouncer();
    }

    /**
     * Handles pointer-on-image state changes.
     */
    handleIsPointerOnImage(isPointerOnImage: boolean): void {
        if (this.isPointerOnImage !== isPointerOnImage) {
            this.isPointerOnImage = isPointerOnImage;
            this.isPointerOnImage$.next(isPointerOnImage);
        }
    }

    /**
     * Handles drawing state changes.
     */
    handleDrawingChange(isDrawing: boolean): void {
        if (this.isDrawing !== isDrawing) {
            this.isDrawing = isDrawing;
            this.isDrawing$.next(isDrawing);
        }
    }

    /**
     * Handles vertex dragging state changes.
     */
    handleVertexDragging(isDragging: boolean): void {
        if (this.isVertexDragging !== isDragging) {
            this.isVertexDragging = isDragging;
            this.isVertexDragging$.next(isDragging);
        }
    }

    /**
     * Handles snap state changes.
     */
    handleSnapped(isSnapped: boolean): void {
        if (this.isSnapped !== isSnapped) {
            this.isSnapped = isSnapped;
            this.isSnapped$.next(isSnapped);
        }
    }

    /**
     * Returns the current inline label menu state as a snapshot.
     */
    getInlineLabelMenuState(): InlineLabelMenuState {
        return this.inlineLabelMenu$.value;
    }

    /**
     * Clean up DOM event listeners and subscriptions on service destruction.
     */
    destroy(): void {
        document.removeEventListener(KeyEventType.KeyDown, this.handleKeyDownBound, true);
        document.removeEventListener(KeyEventType.KeyUp, this.handleKeyUpBound, true);
        this.mapElement?.removeEventListener("mousemove", this.handleMouseMoveBound);
        this.mapElement?.removeEventListener("click", this.handleClickBound);

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

    private handleLabelsChanged(): void {
        if (!this.currentDocument) {
            return;
        }

        this.setInlineLabelMenuHidden();
        this.clearSelectedFeatures();
        this.clearLabelFeatures();
        this.clearRegionFeatures();

        const currentLabels = this.labels[this.currentDocument.name];
        if (currentLabels && currentLabels.length > 0) {
            this.drawLabelFeatures(currentLabels, this.colorForFields, this.currentDocument.currentPage);
        }
    }

    private clearSelectedFeatures(): void {
        this.selectedFeatures.forEach((feature) => feature.set(SELECTED_PROPERTY, false));
        this.selectedFeatures = [];
        this.store.dispatch(setLabelValueCandidates({ candidates: [] }));
    }

    private addSelectedFeature(feature: Feature): void {
        this.selectedFeatures.push(feature);
        feature.set(SELECTED_PROPERTY, true);
    }

    private removeSelectedFeature(feature: Feature): void {
        const index = this.selectedFeatures.indexOf(feature);
        if (index !== -1) {
            this.selectedFeatures.splice(index, 1);
        }
        feature.set(SELECTED_PROPERTY, false);
    }

    private isFeatureSelected(feature: Feature): boolean {
        return this.selectedFeatures.includes(feature);
    }

    private computeEnabledTypesForInlineMenu(): FieldType[] {
        const selectedCategories = this.selectedFeatures.map(
            (f: Feature) => f.getProperties()["category"] as FeatureCategory
        );
        const categories = Array.from(new Set(selectedCategories)) as FeatureCategory[];

        if (this.selectedFeatures.length === 1 && categories.includes(FeatureCategory.Checkbox)) {
            return supportedFieldTypesByCategory[FeatureCategory.Checkbox];
        } else if (categories.includes(FeatureCategory.DrawnRegion)) {
            return supportedFieldTypesByCategory[FeatureCategory.DrawnRegion];
        } else if (categories.includes(FeatureCategory.Label)) {
            return supportedFieldTypesByCategory[FeatureCategory.Label];
        } else {
            return supportedFieldTypesByCategory[FeatureCategory.Text];
        }
    }

    private setInlineLabelMenuHidden(): void {
        const current = this.inlineLabelMenu$.value;
        if (current.showPopup) {
            this.inlineLabelMenu$.next({
                ...current,
                showPopup: false,
            });
        }
    }

    private makeFeature(
        text: string,
        boundingBox: number[],
        imageExtent: Extent,
        color: string,
        page: number,
        labelName: string,
        category: FeatureCategory
    ): Feature {
        const coordinates: number[][] = [];
        const imageWidth = imageExtent[2] - imageExtent[0];
        const imageHeight = imageExtent[3] - imageExtent[1];

        for (let i = 0; i < boundingBox.length; i += 2) {
            coordinates.push([
                Math.round(boundingBox[i] * imageWidth),
                Math.round((1 - boundingBox[i + 1]) * imageHeight),
            ]);
        }

        const featureId = createRegionIdFromPolygon(boundingBox, page);
        const feature = new Feature({
            geometry: new Polygon([coordinates]),
            id: featureId,
            text,
            boundingbox: boundingBox,
            highlighted: false,
            color,
            isLabelFeature: true,
            alreadyAssignedLabelName: labelName,
            category,
        });

        return feature;
    }

    private getColorForLabel(label: Label, colorForFields: Record<string, string>[]): string {
        return getColorByFieldKey(colorForFields, getFieldKeyFromLabel(label));
    }

    private makeLabelValueCandidate(feature: Feature): LabelValueCandidate {
        return {
            boundingBoxes: [getBoundingBoxFromFeatureId(feature.get("id"))] as any,
            page: this.currentDocument?.currentPage || 1,
            text: feature.get("text"),
            category: feature.get("category") || FeatureCategory.Text,
            alreadyAssignedLabelName: feature.get("alreadyAssignedLabelName"),
        };
    }

    private getFeatureCoordinates(feature: Feature): number[][] {
        return (feature.getGeometry() as Polygon).getCoordinates()[0];
    }

    private getFeatureIdAndBoundingBox(featureCoordinates: number[][]): { featureId: string; boundingBox: number[] } {
        const imageExtent = this.imageMap!.getImageExtent();
        const imageWidth = imageExtent[2] - imageExtent[0];
        const imageHeight = imageExtent[3] - imageExtent[1];
        const boundingBox: number[] = [];
        featureCoordinates.forEach((coordinate) => {
            boundingBox.push(coordinate[0] / imageWidth);
            boundingBox.push(1 - coordinate[1] / imageHeight);
        });
        const featureId = createRegionIdFromPolygon(
            boundingBox,
            this.currentDocument?.currentPage || 1
        );
        return { featureId, boundingBox };
    }

    private updateHoveredFeature(prevHoveredLabelName: string): void {
        const labelFeatures = this.imageMap?.getAllLabelFeatures() || [];
        const regionFeatures = this.imageMap?.getAllDrawnRegionFeatures() || [];
        const allFeatures = labelFeatures.concat(regionFeatures);

        const oldFeatures = allFeatures.filter(
            (f: Feature) => f.get("alreadyAssignedLabelName") === prevHoveredLabelName
        );
        oldFeatures.forEach((f: Feature) => f.set(HIGHLIGHTED_PROPERTY, false));

        const newFeatures = allFeatures.filter(
            (f: Feature) => f.get("alreadyAssignedLabelName") === this.hoveredLabelName
        );
        newFeatures.forEach((f: Feature) => f.set(HIGHLIGHTED_PROPERTY, true));
    }

    private setDeleteRegionIconPosition(feature: Feature): void {
        const featureCoordinates = this.getFeatureCoordinates(feature);
        const positions = featureCoordinates.map((coord) => this.imageMap?.getCoordinatePixelPosition(coord));
        const top = positions[1]![1] - this.deleteIconBottomOffset;
        const left = positions[1]![0] - this.deleteIconLeftOffset;
        this.deleteRegionIcon$.next({ show: true, top, left });
    }

    private handleDeleteDrawnRegionDebouncer(): void {
        this.isDebouncing = true;
        clearTimeout(this.deleteDrawnRegionDebouncer);
        this.deleteDrawnRegionDebouncer = setTimeout(() => {
            this.deleteRegionIcon$.next({ show: false, top: 0, left: 0 });
            this.isDebouncing = false;
        }, 300);
    }

    private handleKeyDown(keyEvent: KeyboardEvent): void {
        if (!this.imageMap) {
            return;
        }
        switch (keyEvent.key) {
            case KeyEventCode.Shift:
                this.groupSelectMode = true;
                this.groupSelectMode$.next(true);
                break;

            case KeyEventCode.Escape:
                if (this.isDrawing) {
                    this.imageMap.cancelDrawing();
                } else if (this.isVertexDragging) {
                    this.imageMap.cancelModify();
                }
                break;
        }
    }

    private handleKeyUp(keyEvent: KeyboardEvent): void {
        if (!this.imageMap) {
            return;
        }
        if (keyEvent.key === KeyEventCode.Shift) {
            this.groupSelectMode = false;
            this.groupSelectMode$.next(false);
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        const { clientX, clientY } = event;
        this.mousePositionX = clientX;
        this.mousePositionY = clientY;
    }

    private handleClick(): void {
        if (this.inlineLabelMenu$.value.showPopup) {
            if (this.ignoreOpenPopupFirstClick) {
                this.ignoreOpenPopupFirstClick = false;
                return;
            }
            this.setInlineLabelMenuHidden();
        }
    }
}
