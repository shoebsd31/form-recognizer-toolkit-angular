import { Component, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngrx/store";
import { Subject } from "rxjs";
import { takeUntil, distinctUntilChanged, pairwise, startWith } from "rxjs/operators";
import { LabelListComponent} from "./components/label-list.component";
import { TableLabelItemComponent } from "./components/table-label-item.component";
import { FieldCalloutComponent } from "./components/field-callout.component";
import { CreateTableModalComponent } from "./components/create-table-modal.component";
import {
    Field,
    FieldType,
    FieldFormat,
    Label,
    ObjectField,
    ArrayField,
    TableType,
    HeaderType,
    Definitions,
    Labels,
} from "../../models/custom-models";
import {
    selectFields,
    selectLabels,
    selectDefinitions,
} from "../../store/custom-model/custom-model.selectors";
import { selectHoveredLabelName } from "../../store/canvas/canvas.selectors";
import { selectCurrentDocument } from "../../store/documents/documents.selectors";
import {
    addField,
    addTableField,
    deleteTableField,
    renameTableField,
    insertTableField,
    deleteLabelByLabel,
    assignLabel,
    setHideInlineLabelMenu,
    setFields,
} from "../../store/custom-model/custom-model.actions";
import { setHoveredLabelName } from "../../store/canvas/canvas.actions";
import { FieldLocation } from "../../store/custom-model/custom-model.state";
import { getFieldKeyFromLabel } from "../../utils/custom-model";
import { TableLayerService } from "../../services/table-layer.service";

@Component({
    selector: "app-label-pane",
    standalone: true,
    imports: [
        CommonModule,
        LabelListComponent,
        TableLabelItemComponent,
        FieldCalloutComponent,
        CreateTableModalComponent,
    ],
    template: `
        <div class="label-pane">
            <!-- Table Pane View -->
            <ng-container *ngIf="isTablePaneOpen; else fieldListView">
                <div class="table-pane">
                    <div class="table-pane-header">
                        <div class="table-pane-header-left">
                            <span class="table-pane-title">{{ tableFieldKey }}</span>
                            <span class="table-pane-type">Table</span>
                        </div>
                        <button
                            type="button"
                            class="btn-icon"
                            title="Close"
                            (click)="handleTablePaneClose()"
                        ><i class="pi pi-times"></i></button>
                    </div>
                    <div class="table-pane-body">
                        <ol>
                            <li *ngFor="let instruction of tableInstructions">{{ instruction }}</li>
                        </ol>
                        <div class="table-label-item-container" *ngIf="tableFieldKey && tableField && getTableDefinition(tableFieldKey)">
                            <app-table-label-item
                                [field]="tableField"
                                [tableLabels]="getTableLabels(tableFieldKey)"
                                [definition]="getTableDefinition(tableFieldKey)!"
                                (deleteFieldEvent)="handleDeleteTableField($event)"
                                (insertFieldEvent)="handleInsertTableField($event)"
                                (renameFieldEvent)="handleRenameTableField($event)"
                                (deleteLabelEvent)="handleDeleteTableLabel($event)"
                                (clickCell)="handleAssignLabel($event)"
                                (cellMouseEnter)="handleItemMouseEnter($event)"
                                (cellMouseLeave)="handleItemMouseLeave()"
                            ></app-table-label-item>
                        </div>
                    </div>
                </div>
            </ng-container>

            <!-- Field List View -->
            <ng-template #fieldListView>
                <div class="label-pane-command-bar">
                    <div><!-- TODO: put item count UI here --></div>
                    <div class="command-bar-actions" *ngIf="allowAddFields">
                        <button
                            #addButton
                            type="button"
                            class="btn-icon"
                            title="Add field"
                            (click)="toggleFieldMenu($event)"
                        ><i class="pi pi-plus"></i></button>
                        <div
                            *ngIf="showFieldMenu"
                            class="field-menu-overlay"
                            (click)="showFieldMenu = false"
                        ></div>
                        <div *ngIf="showFieldMenu" class="field-menu">
                            <div
                                *ngFor="let option of visibleFieldOptions"
                                class="field-menu-item"
                                (click)="onFieldOptionClick(option)"
                            >
                                <i [class]="option.icon"></i>
                                <span>{{ option.text }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="label-list-container">
                    <app-label-list (tablePaneOpen)="handleTablePaneOpen($event)"></app-label-list>
                </div>
                <app-field-callout
                    #fieldCallout
                    [width]="268"
                    (createField)="handleCreateField($event)"
                    (dismiss)="handleCreateFieldDismiss()"
                ></app-field-callout>
            </ng-template>

            <!-- Create Table Modal -->
            <app-create-table-modal
                [(isOpen)]="isCreateTableModalOpen"
                (close)="handleCreateTableModalClose()"
                (createFieldEvent)="handleCreateTableField($event)"
            ></app-create-table-modal>
        </div>
    `,
    styleUrls: ["./label-pane.component.scss"],
})
export class LabelPaneComponent implements OnInit, OnDestroy {
    @Input() isTablePaneOpen: boolean = false;
    @Input() allowAddFields: boolean = true;
    @Input() allowTable: boolean = true;
    @Output() isTablePaneOpenChange = new EventEmitter<boolean>();

    @ViewChild("fieldCallout") fieldCallout!: FieldCalloutComponent;
    @ViewChild(CreateTableModalComponent) createTableModal!: CreateTableModalComponent;

    fields: Field[] = [];
    labels: Labels = {};
    definitions: Definitions = {};
    currentDocumentName: string | undefined;
    hoveredLabelName: string = "";

    isFieldCalloutOpen = false;
    isCreateTableModalOpen = false;
    showAllFields = true;
    createFieldType: FieldType | undefined;
    tableFieldKey: string | undefined;
    showFieldMenu = false;

    tableInstructions = [
        "In your document, select the words you want to label.",
        "In the labeling pane, click the table cell to assign them to that cell.",
    ];

    fieldOptions = [
        { key: "field", text: "Field", icon: "pi pi-list", fieldType: FieldType.String },
        { key: "selectionMark", text: "Selection Mark", icon: "pi pi-check-square", fieldType: FieldType.SelectionMark },
        { key: "signature", text: "Signature", icon: "pi pi-pencil", fieldType: FieldType.Signature },
        { key: "table", text: "Table", icon: "pi pi-table", fieldType: undefined },
    ];

    get visibleFieldOptions() {
        return this.allowTable
            ? this.fieldOptions
            : this.fieldOptions.filter((opt) => opt.key !== "table");
    }

    private destroy$ = new Subject<void>();

    constructor(private store: Store, private tableLayerService: TableLayerService) {}

    ngOnInit() {
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
                this.labels = labels;
            });

        this.store
            .select(selectDefinitions)
            .pipe(takeUntil(this.destroy$))
            .subscribe((definitions) => {
                this.definitions = definitions;
            });

        this.store
            .select(selectCurrentDocument)
            .pipe(takeUntil(this.destroy$))
            .subscribe((doc) => {
                const prevName = this.currentDocumentName;
                this.currentDocumentName = doc?.name;
                if (prevName !== undefined && prevName !== this.currentDocumentName) {
                    this.clearStates();
                }
            });

        this.store
            .select(selectHoveredLabelName)
            .pipe(takeUntil(this.destroy$))
            .subscribe((name) => {
                this.hoveredLabelName = name;
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    get tableField(): Field | undefined {
        return this.fields.find((f) => f.fieldKey === this.tableFieldKey);
    }

    private clearStates() {
        this.store.dispatch(setHideInlineLabelMenu({ hide: false }));
        this.isFieldCalloutOpen = false;
        this.createFieldType = undefined;
        this.tableFieldKey = undefined;
        if (this.isTablePaneOpen) {
            this.tableLayerService.unhighlightAllTables();
        }
        this.isTablePaneOpen = false;
        this.isTablePaneOpenChange.emit(false);
    }

    private getDocumentLabels(): Label[] {
        if (this.currentDocumentName) {
            return this.labels[this.currentDocumentName] || [];
        }
        return [];
    }

    getTableLabels(fieldKey: string): { [labelName: string]: Label } {
        const labels = this.getDocumentLabels().filter((label) => getFieldKeyFromLabel(label) === fieldKey);
        return labels.reduce((obj, item) => ({ ...obj, [item.label]: item }), {} as { [key: string]: Label });
    }

    getTableDefinition(fieldKey: string): ObjectField | undefined {
        const field = this.fields.find((f) => f.fieldKey === fieldKey);
        if (!field) return undefined;
        if (field.fieldType === FieldType.Array) {
            const { itemType } = field as ArrayField;
            return this.definitions[itemType];
        } else {
            const objField = field as ObjectField;
            if (!objField.fields || objField.fields.length === 0) return undefined;
            const { fieldType } = objField.fields[0];
            return this.definitions[fieldType];
        }
    }

    onGetCreateFieldErrorMessage = (value: string): string | undefined => {
        const isDuplicate = this.fields.some((field) => field.fieldKey === value);
        if (isDuplicate) {
            return "The field already exists.";
        }
        return undefined;
    };

    // Field menu
    toggleFieldMenu(event: Event) {
        event.stopPropagation();
        if (this.isFieldCalloutOpen) {
            this.handleCreateFieldDismiss();
        }
        this.showFieldMenu = !this.showFieldMenu;
    }

    onFieldOptionClick(option: any) {
        this.showFieldMenu = false;
        if (option.key === "table") {
            this.isCreateTableModalOpen = true;
            setTimeout(() => {
                if (this.createTableModal) {
                    this.createTableModal.getNameErrorMessage = this.onGetCreateFieldErrorMessage;
                }
            }, 0);
        } else {
            this.createFieldType = option.fieldType;
            this.isFieldCalloutOpen = true;
            // Show the callout after a tick so the DOM has the button reference
            setTimeout(() => {
                const addBtn = document.querySelector('[title="Add field"]');
                if (addBtn && this.fieldCallout) {
                    this.fieldCallout.show(
                        { target: addBtn } as any,
                        this.onGetCreateFieldErrorMessage
                    );
                }
            }, 0);
        }
    }

    // Field CRUD
    handleCreateField(value: string) {
        if (!value || !this.createFieldType) return;
        const newField: Field = {
            fieldKey: value,
            fieldType: this.createFieldType,
            fieldFormat: FieldFormat.NotSpecified,
        };
        this.store.dispatch(addField({ field: newField }));
        this.isFieldCalloutOpen = false;
        this.createFieldType = undefined;
    }

    handleCreateFieldDismiss() {
        this.isFieldCalloutOpen = false;
        this.createFieldType = undefined;
    }

    handleCreateTableField(event: { fieldKey: string; tableType: TableType; headerType: HeaderType }) {
        this.store.dispatch(
            addTableField({
                fieldKey: event.fieldKey,
                tableType: event.tableType,
                headerType: event.headerType,
            })
        );
    }

    handleCreateTableModalClose() {
        this.isCreateTableModalOpen = false;
    }

    // Table pane
    handleTablePaneOpen(field: Field) {
        this.isTablePaneOpen = true;
        this.isTablePaneOpenChange.emit(true);
        this.tableFieldKey = field.fieldKey;
        this.tableLayerService.highlightAllTables();
    }

    handleTablePaneClose() {
        this.store.dispatch(setHideInlineLabelMenu({ hide: false }));
        this.isTablePaneOpen = false;
        this.isTablePaneOpenChange.emit(false);
        this.tableFieldKey = undefined;
        this.tableLayerService.unhighlightAllTables();
    }

    // Table field operations
    handleDeleteTableField(event: { tableFieldKey: string; fieldKey: string; fieldLocation: FieldLocation }) {
        this.store.dispatch(
            deleteTableField({
                tableFieldKey: event.tableFieldKey,
                fieldKey: event.fieldKey,
                fieldLocation: event.fieldLocation,
            })
        );
    }

    handleInsertTableField(event: {
        tableFieldKey: string;
        fieldKey: string;
        index: number;
        fieldLocation: FieldLocation;
    }) {
        this.store.dispatch(
            insertTableField({
                tableFieldKey: event.tableFieldKey,
                fieldKey: event.fieldKey,
                index: event.index,
                fieldLocation: event.fieldLocation,
            })
        );
    }

    handleRenameTableField(event: {
        tableFieldKey: string;
        fieldKey: string;
        newName: string;
        fieldLocation: FieldLocation;
    }) {
        this.store.dispatch(
            renameTableField({
                tableFieldKey: event.tableFieldKey,
                fieldKey: event.fieldKey,
                newName: event.newName,
                fieldLocation: event.fieldLocation,
            })
        );
    }

    handleDeleteTableLabel(label: string) {
        this.store.dispatch(deleteLabelByLabel({ targetLabel: label }));
    }

    handleAssignLabel(labelName: string) {
        this.store.dispatch(assignLabel({ labelName }));
    }

    handleItemMouseEnter(labelName: string) {
        if (this.hoveredLabelName !== labelName) {
            this.store.dispatch(setHoveredLabelName({ name: labelName }));
        }
    }

    handleItemMouseLeave() {
        this.store.dispatch(setHoveredLabelName({ name: "" }));
    }
}
