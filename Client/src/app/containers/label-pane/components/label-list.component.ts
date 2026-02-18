import { Component, Output, EventEmitter, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngrx/store";
import { Observable, Subject, combineLatest } from "rxjs";
import { takeUntil, distinctUntilChanged, pairwise, startWith } from "rxjs/operators";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { LabelItemComponent } from "./label-item.component";
import { Field, FieldType, Label } from "../../../models/custom-models";
import {
    getColorByFieldKey,
    getFieldKeyFromLabel,
    getFieldColor,
    getUnusedFieldColor,
} from "../../../utils/custom-model";
import {
    selectFields,
    selectColorForFields,
    selectLabels,
} from "../../../store/custom-model/custom-model.selectors";
import { selectHoveredLabelName } from "../../../store/canvas/canvas.selectors";
import { selectCurrentDocument } from "../../../store/documents/documents.selectors";
import {
    switchSubType,
    deleteField,
    renameField,
    deleteLabelByField,
    assignLabel,
    setColorForFields,
    setHideInlineLabelMenu,
    updateFieldsOrder,
} from "../../../store/custom-model/custom-model.actions";
import { setHoveredLabelName } from "../../../store/canvas/canvas.actions";

@Component({
    selector: "app-label-list",
    standalone: true,
    imports: [CommonModule, DragDropModule, LabelItemComponent],
    template: `
        <div class="label-list" cdkDropList (cdkDropListDropped)="handleDragDrop($event)">
            <ng-container *ngFor="let field of fields; let i = index">
                <div cdkDrag>
                    <hr *ngIf="i !== 0" class="item-separator" />
                    <app-label-item
                        [field]="field"
                        [label]="getDocumentLabel(field.fieldKey)"
                        [color]="getColor(field.fieldKey)"
                        [getRenameErrorMessage]="getCreateFieldErrorMessage"
                        (deleteLabel)="handleDeleteLabel($event)"
                        (switchSubType)="handleSwitchSubType($event)"
                        (deleteField)="handleDeleteField($event)"
                        (renameField)="handleRenameField($event)"
                        (clickTableField)="handleTablePaneOpen($event)"
                        (clickField)="handleAssignLabel($event)"
                        (itemMouseEnter)="handleItemMouseEnter($event)"
                        (itemMouseLeave)="handleItemMouseLeave()"
                        cdkDragHandle
                    ></app-label-item>
                    <div *cdkDragPlaceholder class="drag-placeholder"></div>
                </div>
            </ng-container>
        </div>
    `,
    styleUrls: ["./label-list.component.scss"],
})
export class LabelListComponent implements OnInit, OnDestroy {
    @Output() tablePaneOpen = new EventEmitter<Field>();

    fields: Field[] = [];
    colorForFields: Record<string, string>[] = [];
    labels: { [documentName: string]: Label[] } = {};
    currentDocumentName: string | undefined;
    hoveredLabelName: string = "";

    private destroy$ = new Subject<void>();

    constructor(private store: Store) {}

    ngOnInit() {
        this.store
            .select(selectFields)
            .pipe(takeUntil(this.destroy$))
            .subscribe((fields) => {
                this.fields = fields;
            });

        this.store
            .select(selectColorForFields)
            .pipe(takeUntil(this.destroy$))
            .subscribe((colorForFields) => {
                this.colorForFields = colorForFields;
            });

        this.store
            .select(selectLabels)
            .pipe(takeUntil(this.destroy$))
            .subscribe((labels) => {
                this.labels = labels;
            });

        this.store
            .select(selectCurrentDocument)
            .pipe(takeUntil(this.destroy$))
            .subscribe((doc) => {
                this.currentDocumentName = doc?.name;
            });

        this.store
            .select(selectHoveredLabelName)
            .pipe(takeUntil(this.destroy$))
            .subscribe((name) => {
                this.hoveredLabelName = name;
            });

        // Watch fields for color updates
        this.store
            .select(selectFields)
            .pipe(startWith([] as Field[]), pairwise(), takeUntil(this.destroy$))
            .subscribe(([prevFields, currentFields]) => {
                if (currentFields.length > prevFields.length) {
                    const addedFields = currentFields.filter(
                        (field) => !prevFields.some((pf) => pf.fieldKey === field.fieldKey)
                    );
                    const addedColorMap = addedFields.map((field) => ({
                        [field.fieldKey]:
                            prevFields.length === 0
                                ? getFieldColor(currentFields, field.fieldKey)
                                : getUnusedFieldColor(this.colorForFields),
                    }));
                    this.store.dispatch(
                        setColorForFields({ colorForFields: [...this.colorForFields, ...addedColorMap] })
                    );
                }
                if (currentFields.length < prevFields.length) {
                    const removedFields = prevFields.filter(
                        (field) => !currentFields.some((cf) => cf.fieldKey === field.fieldKey)
                    );
                    const removedKeys = removedFields.map((field) => field.fieldKey);
                    this.store.dispatch(
                        setColorForFields({
                            colorForFields: this.colorForFields.filter(
                                (color) => Object.keys(color)[0] !== removedKeys[0]
                            ),
                        })
                    );
                }
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    getDocumentLabel(fieldKey: string): Label | undefined {
        if (!this.currentDocumentName) return undefined;
        const docLabels = this.labels[this.currentDocumentName] || [];
        return docLabels.find((label) => getFieldKeyFromLabel(label) === fieldKey);
    }

    getColor(fieldKey: string): string {
        return getColorByFieldKey(this.colorForFields, fieldKey);
    }

    getCreateFieldErrorMessage = (value: string): string | undefined => {
        const isDuplicate = this.fields.some((field) => field.fieldKey === value);
        if (isDuplicate) {
            return "The field already exists.";
        }
        return undefined;
    };

    handleDeleteLabel(fieldKey: string) {
        this.store.dispatch(deleteLabelByField({ fieldKey }));
    }

    handleSwitchSubType(event: { fieldKey: string; fieldType: FieldType }) {
        this.store.dispatch(switchSubType({ fieldKey: event.fieldKey, fieldType: event.fieldType }));
    }

    handleDeleteField(fieldKey: string) {
        this.store.dispatch(deleteField({ fieldKey }));
    }

    handleRenameField(event: { oldName: string; newName: string }) {
        this.store.dispatch(renameField({ fieldKey: event.oldName, newName: event.newName }));
    }

    handleAssignLabel(labelName: string) {
        this.store.dispatch(assignLabel({ labelName }));
    }

    handleTablePaneOpen(field: Field) {
        this.store.dispatch(setHideInlineLabelMenu({ hide: true }));
        this.tablePaneOpen.emit(field);
    }

    handleItemMouseEnter(labelName: string) {
        if (this.hoveredLabelName !== labelName) {
            this.store.dispatch(setHoveredLabelName({ name: labelName }));
        }
    }

    handleItemMouseLeave() {
        this.store.dispatch(setHoveredLabelName({ name: "" }));
    }

    handleDragDrop(event: CdkDragDrop<Field[]>) {
        if (event.previousIndex === event.currentIndex) return;
        const reorderedFields = [...this.fields];
        moveItemInArray(reorderedFields, event.previousIndex, event.currentIndex);
        this.store.dispatch(updateFieldsOrder({ fields: reorderedFields }));
    }
}
