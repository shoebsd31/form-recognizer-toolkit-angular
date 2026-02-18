import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnChanges,
    SimpleChanges,
    ViewChild,
    ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Store } from "@ngrx/store";
import { MessageModalComponent} from "../../../components/message-modal/message-modal.component";
import {
    Field,
    FieldType,
    ObjectField,
    Label,
    LabelType,
    VisualizationHint,
    HeaderType,
} from "../../../models/custom-models";
import { encodeLabelString, getFieldKeyFromLabel, getDynamicTableRowNumberFromLabel } from "../../../utils/custom-model";
import { FieldLocation } from "../../../store/custom-model/custom-model.state";
import { switchTableFieldsSubType, updateTableLabel } from "../../../store/custom-model/custom-model.actions";
import { selectLabelError } from "../../../store/custom-model/custom-model.selectors";

type TableLabels = { [labelName: string]: Label };

interface DeletingField {
    fieldKey: string;
    fieldLocation: FieldLocation;
}

interface RenamingField {
    headerType: HeaderType;
    fieldKey: string;
    fieldLocation: FieldLocation;
}

interface InsertingField {
    headerType: HeaderType;
    index: number;
    fieldLocation: FieldLocation;
}

@Component({
    selector: "app-table-label-item",
    standalone: true,
    imports: [CommonModule, FormsModule, MessageModalComponent],
    template: `
        <div class="table-label-item">
            <div class="table-body-container">
                <table class="table-body">
                    <thead>
                        <!-- Table Header -->
                        <tr>
                            <th class="empty-header"></th>
                            <ng-container *ngFor="let col of headerColumns; let i = index">
                                <th
                                    *ngIf="!isInsertingAt('column', i)"
                                    class="general-header"
                                    (dblclick)="handleRenameClick(getHeaderType('column'), col.fieldKey, getColumnFieldLocation())"
                                >
                                    <ng-container *ngIf="isRenamingHeader('column', col.fieldKey); else headerButton">
                                        <div class="header-input-container">
                                            <input
                                                #renameInput
                                                type="text"
                                                [value]="col.fieldKey"
                                                (keydown)="handleRenameKeyDown($event)"
                                                (blur)="handleRenameBlur()"
                                                autocomplete="off"
                                                class="header-textfield input-text"
                                            />
                                            <div *ngIf="renameError" class="input-error">{{ renameError }}</div>
                                        </div>
                                    </ng-container>
                                    <ng-template #headerButton>
                                        <div class="header-button-wrapper">
                                            <button
                                                type="button"
                                                class="header-button"
                                                (click)="toggleHeaderMenu($event, 'column', col.fieldKey, i, getColumnFieldLocation())"
                                            >{{ col.fieldKey }}</button>
                                        </div>
                                        <div
                                            *ngIf="activeHeaderMenu?.fieldKey === col.fieldKey && activeHeaderMenu?.headerType === 'column'"
                                            class="header-context-menu-overlay"
                                            (click)="activeHeaderMenu = null"
                                        ></div>
                                        <div
                                            *ngIf="activeHeaderMenu?.fieldKey === col.fieldKey && activeHeaderMenu?.headerType === 'column'"
                                            class="header-context-menu"
                                        >
                                            <div
                                                class="context-menu-item"
                                                (click)="handleRenameClick(getHeaderType('column'), col.fieldKey, getColumnFieldLocation()); activeHeaderMenu = null"
                                            >
                                                Rename column
                                            </div>
                                            <div
                                                class="context-menu-item"
                                                (click)="handleInsertClick(getHeaderType('column'), i, getColumnFieldLocation()); activeHeaderMenu = null"
                                            >
                                                Insert column
                                            </div>
                                            <div
                                                class="context-menu-item"
                                                [class.disabled]="isColumnDeleteDisabled"
                                                (click)="!isColumnDeleteDisabled && handleDeleteClick(col.fieldKey, getColumnFieldLocation()); activeHeaderMenu = null"
                                            >
                                                Delete column
                                            </div>
                                            <div class="context-menu-separator"></div>
                                            <div class="context-menu-label">Sub type</div>
                                            <div
                                                *ngFor="let opt of subTypeOptions"
                                                class="context-menu-item"
                                                [class.disabled]="isSubTypeDisabledForColumn"
                                                (click)="!isSubTypeDisabledForColumn && handleSubTypeChange(col, opt.key); activeHeaderMenu = null"
                                            >
                                                <i *ngIf="col.fieldType === opt.key" class="pi pi-check" style="margin-right: 4px"></i>
                                                {{ opt.text }}
                                            </div>
                                        </div>
                                    </ng-template>
                                </th>
                                <th *ngIf="isInsertingAt('column', i)" class="general-header">
                                    <div class="header-input-container">
                                        <input
                                            #insertInput
                                            type="text"
                                            (keydown)="handleInsertKeyDown($event)"
                                            (blur)="handleInsertBlur()"
                                            autocomplete="off"
                                            class="header-textfield input-text"
                                        />
                                        <div *ngIf="insertError" class="input-error">{{ insertError }}</div>
                                    </div>
                                </th>
                            </ng-container>
                            <!-- Insert column at end -->
                            <th *ngIf="insertingField && insertingField.headerType === HeaderType.column && insertingField.index === headerColumns.length" class="general-header">
                                <div class="header-input-container">
                                    <input
                                        #insertInput
                                        type="text"
                                        (keydown)="handleInsertKeyDown($event)"
                                        (blur)="handleInsertBlur()"
                                        autocomplete="off"
                                        class="header-textfield input-text"
                                    />
                                    <div *ngIf="insertError" class="input-error">{{ insertError }}</div>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Dynamic table rows -->
                        <ng-container *ngIf="isDynamic">
                            <tr *ngFor="let row of dynamicRowIndices; let rowIdx = index">
                                <!-- Dynamic row header -->
                                <th class="general-header">
                                    <div class="header-button-wrapper">
                                        <button
                                            type="button"
                                            class="header-button"
                                            (click)="toggleDynamicRowMenu($event, rowIdx)"
                                        >{{ '#' + rowIdx }}</button>
                                    </div>
                                    <div
                                        *ngIf="activeDynamicRowMenu === rowIdx"
                                        class="header-context-menu-overlay"
                                        (click)="activeDynamicRowMenu = null"
                                    ></div>
                                    <div
                                        *ngIf="activeDynamicRowMenu === rowIdx"
                                        class="header-context-menu"
                                    >
                                        <div class="context-menu-item" (click)="handleDynamicTableRowInsert(rowIdx); activeDynamicRowMenu = null">
                                            Insert row
                                        </div>
                                        <div
                                            class="context-menu-item"
                                            [class.disabled]="dynamicRows <= 1"
                                            (click)="dynamicRows > 1 && handleDynamicTableRowDelete(rowIdx); activeDynamicRowMenu = null"
                                        >
                                            Delete row
                                        </div>
                                    </div>
                                </th>
                                <!-- Dynamic row cells -->
                                <td
                                    *ngFor="let col of definitionColumns; let colIdx = index"
                                    role="gridcell"
                                    class="table-cell"
                                    (click)="handleTableCellClick(getDynamicCellLabel(rowIdx, col.fieldKey))"
                                    (mouseenter)="handleMouseEnter(getDynamicCellLabel(rowIdx, col.fieldKey))"
                                    (mouseleave)="handleMouseLeave()"
                                >
                                    <ng-container *ngIf="getTableCellContent(getDynamicCellLabel(rowIdx, col.fieldKey)) as content">
                                        <i *ngIf="content.isRegion" class="pi pi-pencil label-item-icon"></i>
                                        <span *ngIf="!content.isRegion">{{ content.text }}</span>
                                        <button
                                            *ngIf="content.hasContent"
                                            type="button"
                                            class="btn-icon delete-cell-button"
                                            (click)="handleDeleteLabel($event, getDynamicCellLabel(rowIdx, col.fieldKey))"
                                        ><i class="pi pi-times"></i></button>
                                    </ng-container>
                                </td>
                                <td *ngIf="insertingField && insertingField.headerType === HeaderType.column" class="table-cell"></td>
                            </tr>
                        </ng-container>
                        <!-- Fixed table rows -->
                        <ng-container *ngIf="!isDynamic">
                            <ng-container *ngFor="let row of fixedRows; let rowIdx = index">
                                <tr *ngIf="!isInsertingRow(rowIdx)">
                                    <!-- Fixed row header -->
                                    <th
                                        class="general-header"
                                        (dblclick)="handleRenameClick(getHeaderType('row'), row.fieldKey, getRowFieldLocation())"
                                    >
                                        <ng-container *ngIf="isRenamingHeader('row', row.fieldKey); else fixedRowHeaderBtn">
                                            <div class="header-input-container">
                                                <input
                                                    #renameInput
                                                    type="text"
                                                    [value]="row.fieldKey"
                                                    (keydown)="handleRenameKeyDown($event)"
                                                    (blur)="handleRenameBlur()"
                                                    autocomplete="off"
                                                    class="header-textfield input-text"
                                                />
                                                <div *ngIf="renameError" class="input-error">{{ renameError }}</div>
                                            </div>
                                        </ng-container>
                                        <ng-template #fixedRowHeaderBtn>
                                            <div class="header-button-wrapper">
                                                <button
                                                    type="button"
                                                    class="header-button"
                                                    (click)="toggleHeaderMenu($event, 'row', row.fieldKey, rowIdx, getRowFieldLocation())"
                                                >{{ row.fieldKey }}</button>
                                            </div>
                                            <div
                                                *ngIf="activeHeaderMenu?.fieldKey === row.fieldKey && activeHeaderMenu?.headerType === 'row'"
                                                class="header-context-menu-overlay"
                                                (click)="activeHeaderMenu = null"
                                            ></div>
                                            <div
                                                *ngIf="activeHeaderMenu?.fieldKey === row.fieldKey && activeHeaderMenu?.headerType === 'row'"
                                                class="header-context-menu"
                                            >
                                                <div
                                                    class="context-menu-item"
                                                    (click)="handleRenameClick(getHeaderType('row'), row.fieldKey, getRowFieldLocation()); activeHeaderMenu = null"
                                                >
                                                    Rename row
                                                </div>
                                                <div
                                                    class="context-menu-item"
                                                    (click)="handleInsertClick(getHeaderType('row'), rowIdx, getRowFieldLocation()); activeHeaderMenu = null"
                                                >
                                                    Insert row
                                                </div>
                                                <div
                                                    class="context-menu-item"
                                                    [class.disabled]="isRowDeleteDisabled"
                                                    (click)="!isRowDeleteDisabled && handleDeleteClick(row.fieldKey, getRowFieldLocation()); activeHeaderMenu = null"
                                                >
                                                    Delete row
                                                </div>
                                                <div class="context-menu-separator"></div>
                                                <div class="context-menu-label">Sub type</div>
                                                <div
                                                    *ngFor="let opt of subTypeOptions"
                                                    class="context-menu-item"
                                                    [class.disabled]="isSubTypeDisabledForRow"
                                                    (click)="!isSubTypeDisabledForRow && handleSubTypeChange(row, opt.key); activeHeaderMenu = null"
                                                >
                                                    <i *ngIf="row.fieldType === opt.key" class="pi pi-check" style="margin-right: 4px"></i>
                                                    {{ opt.text }}
                                                </div>
                                            </div>
                                        </ng-template>
                                    </th>
                                    <!-- Fixed row cells -->
                                    <td
                                        *ngFor="let col of fixedColumns; let colIdx = index"
                                        role="gridcell"
                                        class="table-cell"
                                        (click)="handleTableCellClick(getFixedCellLabel(row.fieldKey, col.fieldKey))"
                                        (mouseenter)="handleMouseEnter(getFixedCellLabel(row.fieldKey, col.fieldKey))"
                                        (mouseleave)="handleMouseLeave()"
                                    >
                                        <ng-container *ngIf="getTableCellContent(getFixedCellLabel(row.fieldKey, col.fieldKey)) as content">
                                            <i *ngIf="content.isRegion" class="pi pi-pencil label-item-icon"></i>
                                            <span *ngIf="!content.isRegion">{{ content.text }}</span>
                                            <button
                                                *ngIf="content.hasContent"
                                                type="button"
                                                class="btn-icon delete-cell-button"
                                                (click)="handleDeleteLabel($event, getFixedCellLabel(row.fieldKey, col.fieldKey))"
                                            ><i class="pi pi-times"></i></button>
                                        </ng-container>
                                    </td>
                                    <td *ngIf="insertingField && insertingField.headerType === HeaderType.column" class="table-cell"></td>
                                </tr>
                                <!-- Insert row -->
                                <tr *ngIf="isInsertingRow(rowIdx)">
                                    <th class="general-header">
                                        <div class="header-input-container">
                                            <input
                                                #insertInput
                                                type="text"
                                                (keydown)="handleInsertKeyDown($event)"
                                                (blur)="handleInsertBlur()"
                                                autocomplete="off"
                                                class="header-textfield input-text"
                                            />
                                            <div *ngIf="insertError" class="input-error">{{ insertError }}</div>
                                        </div>
                                    </th>
                                    <td *ngFor="let col of fixedColumns" class="table-cell"></td>
                                </tr>
                            </ng-container>
                        </ng-container>
                    </tbody>
                </table>
            </div>
            <!-- Confirm Modal -->
            <app-message-modal
                [isOpen]="isConfirmModalOpen"
                [title]="confirmModalTitle"
                [actionButtonText]="'Yes'"
                [rejectButtonText]="'No'"
                (onActionButtonClick)="onConfirmModalAction()"
                (onClose)="handleConfirmModalClose()"
            >
                <ng-container *ngIf="confirmOperation === 'delete'">
                    Are you sure you want to delete <b>{{ deletingField?.fieldKey }}</b
                    >? All labels and regions assigned to this field will be deleted.
                </ng-container>
                <ng-container *ngIf="confirmOperation === 'rename'">
                    Are you sure you want to rename <b>{{ renamingField?.fieldKey }}</b> to <b>{{ newFieldName }}</b
                    >? All labels and regions assigned to this field will be changed thoroughly.
                </ng-container>
            </app-message-modal>
        </div>
    `,
    styleUrls: ["./table-label-item.component.scss"],
})
export class TableLabelItemComponent implements OnInit, OnChanges {
    @Input() field!: Field;
    @Input() tableLabels: TableLabels = {};
    @Input() definition!: ObjectField;
    @Output() deleteFieldEvent = new EventEmitter<{ tableFieldKey: string; fieldKey: string; fieldLocation: FieldLocation }>();
    @Output() insertFieldEvent = new EventEmitter<{
        tableFieldKey: string;
        fieldKey: string;
        index: number;
        fieldLocation: FieldLocation;
    }>();
    @Output() renameFieldEvent = new EventEmitter<{
        tableFieldKey: string;
        fieldKey: string;
        newName: string;
        fieldLocation: FieldLocation;
    }>();
    @Output() deleteLabelEvent = new EventEmitter<string>();
    @Output() clickCell = new EventEmitter<string>();
    @Output() cellMouseEnter = new EventEmitter<string>();
    @Output() cellMouseLeave = new EventEmitter<void>();

    @ViewChild("renameInput") renameInput!: ElementRef<HTMLInputElement>;
    @ViewChild("insertInput") insertInput!: ElementRef<HTMLInputElement>;

    HeaderType = HeaderType;
    FieldType = FieldType;

    isConfirmModalOpen = false;
    isConfirmModalLoading = false;
    confirmOperation: "delete" | "rename" | undefined;
    dynamicRows = 1;
    deletingField: DeletingField | undefined;
    renamingField: RenamingField | undefined;
    insertingField: InsertingField | undefined;
    newFieldName: string | undefined;
    renameError: string | undefined;
    insertError: string | undefined;
    activeHeaderMenu: { headerType: string; fieldKey: string; index: number; fieldLocation: FieldLocation } | null = null;
    activeDynamicRowMenu: number | null = null;
    isEnteringRename = false;

    subTypeOptions = [
        { key: FieldType.String, text: "String" },
        { key: FieldType.Number, text: "Number" },
        { key: FieldType.Date, text: "Date" },
        { key: FieldType.Time, text: "Time" },
        { key: FieldType.Integer, text: "Integer" },
    ];

    constructor(private store: Store) {}

    ngOnInit() {
        if (this.isDynamic) {
            this.setDynamicRows();
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes["tableLabels"] && !changes["tableLabels"].firstChange) {
            const prevLabels = changes["tableLabels"].previousValue || {};
            const currentLabels = changes["tableLabels"].currentValue || {};
            if (this.getDynamicRowCount(currentLabels) !== this.getDynamicRowCount(prevLabels)) {
                this.dynamicRows = Math.max(this.dynamicRows, this.getDynamicRowCount(currentLabels));
            }
        }
    }

    get isDynamic(): boolean {
        return this.field.fieldType === FieldType.Array;
    }

    get headerColumns(): Field[] {
        if (this.isDynamic) {
            return this.definition.fields;
        }
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? objField.fields : this.definition.fields;
    }

    get definitionColumns(): Field[] {
        return this.definition.fields;
    }

    get fixedColumns(): Field[] {
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? objField.fields : this.definition.fields;
    }

    get fixedRows(): Field[] {
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? this.definition.fields : objField.fields;
    }

    get dynamicRowIndices(): number[] {
        return Array.from({ length: this.dynamicRows }, (_, i) => i);
    }

    get isColumnDeleteDisabled(): boolean {
        if (this.isDynamic) {
            return this.definition.fields.length <= 1;
        }
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? objField.fields.length <= 1 : this.definition.fields.length <= 1;
    }

    get isRowDeleteDisabled(): boolean {
        if (this.isDynamic) {
            return this.dynamicRows <= 1;
        }
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? this.definition.fields.length <= 1 : objField.fields.length <= 1;
    }

    get isSubTypeDisabledForColumn(): boolean {
        if (this.isDynamic) return false;
        const objField = this.field as ObjectField;
        return (
            (objField.visualizationHint === VisualizationHint.Horizontal) ||
            false
        );
    }

    get isSubTypeDisabledForRow(): boolean {
        if (this.isDynamic) return false;
        const objField = this.field as ObjectField;
        return (
            (objField.visualizationHint === VisualizationHint.Vertical) ||
            false
        );
    }

    get confirmModalTitle(): string {
        return this.confirmOperation === "delete" ? "Delete Field" : "Rename Field";
    }

    getHeaderType(type: "column" | "row"): HeaderType {
        return type === "column" ? HeaderType.column : HeaderType.row;
    }

    getColumnFieldLocation(): FieldLocation {
        if (this.isDynamic) {
            return FieldLocation.definition;
        }
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? FieldLocation.field : FieldLocation.definition;
    }

    getRowFieldLocation(): FieldLocation {
        if (this.isDynamic) {
            return FieldLocation.definition;
        }
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        return isFixedRow ? FieldLocation.definition : FieldLocation.field;
    }

    isRenamingHeader(headerType: string, fieldKey: string): boolean {
        return (
            this.renamingField?.fieldKey === fieldKey && this.renamingField?.headerType === headerType
        );
    }

    isInsertingAt(headerType: string, index: number): boolean {
        return (
            !!this.insertingField &&
            this.insertingField.headerType === headerType &&
            this.insertingField.index === index
        );
    }

    isInsertingRow(index: number): boolean {
        return (
            !!this.insertingField &&
            this.insertingField.headerType === HeaderType.row &&
            this.insertingField.index === index
        );
    }

    // Dynamic row helpers
    private getRowNumbers(labels: TableLabels): number[] {
        return Object.keys(labels).map((labelName) => parseInt(labelName.split("/")[1]) + 1);
    }

    private getDynamicRowCount(labels: TableLabels): number {
        const rowNumbers = this.getRowNumbers(labels);
        return rowNumbers.length > 0 ? Math.max(...rowNumbers) : 1;
    }

    private setDynamicRows() {
        const rowNumbers = this.getRowNumbers(this.tableLabels);
        this.dynamicRows = rowNumbers.length > 0 ? Math.max(...rowNumbers) : 1;
    }

    // Cell label construction
    getDynamicCellLabel(rowIndex: number, columnFieldKey: string): string {
        const columnName = encodeLabelString(columnFieldKey);
        const fieldKey = encodeLabelString(this.field.fieldKey);
        return `${fieldKey}/${rowIndex}/${columnName}`;
    }

    getFixedCellLabel(rowFieldKey: string, colFieldKey: string): string {
        const objField = this.field as ObjectField;
        const isFixedRow = objField.visualizationHint === VisualizationHint.Horizontal;
        const columnName = encodeLabelString(colFieldKey);
        const rowName = encodeLabelString(rowFieldKey);
        const fieldKey = encodeLabelString(objField.fieldKey);
        return isFixedRow ? `${fieldKey}/${columnName}/${rowName}` : `${fieldKey}/${rowName}/${columnName}`;
    }

    getTableCellContent(label: string): { text: string; isRegion: boolean; hasContent: boolean } | null {
        const cellLabel = this.tableLabels[label];
        if (!cellLabel) {
            return { text: "", isRegion: false, hasContent: false };
        }
        const isRegion = cellLabel.labelType === LabelType.Region;
        const text = cellLabel.value.map((v) => v.text).join(" ");
        return { text: isRegion ? "" : text, isRegion, hasContent: true };
    }

    // Event handlers
    handleTableCellClick(label: string) {
        this.clickCell.emit(label);
    }

    handleMouseEnter(label: string) {
        if (this.tableLabels && this.tableLabels[label]) {
            this.cellMouseEnter.emit(label);
        }
    }

    handleMouseLeave() {
        this.cellMouseLeave.emit();
    }

    handleDeleteLabel(event: Event, label: string) {
        event.stopPropagation();
        this.deleteLabelEvent.emit(label);
    }

    toggleHeaderMenu(event: Event, headerType: string, fieldKey: string, index: number, fieldLocation: FieldLocation) {
        event.stopPropagation();
        if (this.activeHeaderMenu?.fieldKey === fieldKey && this.activeHeaderMenu?.headerType === headerType) {
            this.activeHeaderMenu = null;
        } else {
            this.activeHeaderMenu = { headerType, fieldKey, index, fieldLocation };
        }
    }

    toggleDynamicRowMenu(event: Event, rowIndex: number) {
        event.stopPropagation();
        this.activeDynamicRowMenu = this.activeDynamicRowMenu === rowIndex ? null : rowIndex;
    }

    handleSubTypeChange(headerField: Field, targetType: FieldType) {
        this.store.dispatch(
            switchTableFieldsSubType({
                tableFieldKey: this.field.fieldKey,
                headerField,
                newType: targetType,
            })
        );
    }

    // Delete
    handleDeleteClick(fieldKey: string, fieldLocation: FieldLocation) {
        this.isConfirmModalOpen = true;
        this.confirmOperation = "delete";
        this.deletingField = { fieldKey, fieldLocation };
    }

    handleDeleteFieldConfirm() {
        if (!this.deletingField) return;
        this.deleteFieldEvent.emit({
            tableFieldKey: this.field.fieldKey,
            fieldKey: this.deletingField.fieldKey,
            fieldLocation: this.deletingField.fieldLocation,
        });
        this.isConfirmModalOpen = false;
        this.confirmOperation = undefined;
        this.deletingField = undefined;
    }

    // Insert
    handleInsertClick(headerType: HeaderType, index: number, fieldLocation: FieldLocation) {
        this.insertingField = { headerType, index: index + 1, fieldLocation };
        setTimeout(() => {
            this.insertInput?.nativeElement?.focus();
        }, 0);
    }

    handleInsertKeyDown(event: KeyboardEvent) {
        const value = (event.target as HTMLInputElement).value;
        this.insertError = this.getInsertErrorMessage(value);
        const hasError = this.insertError !== undefined;
        const isEmpty = !value;

        if (event.key === "Enter" && isEmpty) {
            this.insertingField = undefined;
            return;
        }
        if (event.key === "Escape") {
            this.insertingField = undefined;
            return;
        }
        if (event.key === "Enter" && !hasError) {
            this.handleInsertField(value);
        }
    }

    handleInsertField(fieldKey: string) {
        if (!this.insertingField) return;
        this.insertFieldEvent.emit({
            tableFieldKey: this.field.fieldKey,
            fieldKey,
            index: this.insertingField.index,
            fieldLocation: this.insertingField.fieldLocation,
        });
        this.insertingField = undefined;
    }

    handleInsertBlur() {
        this.insertingField = undefined;
    }

    getInsertErrorMessage(value: string): string | undefined {
        if (!this.insertingField) return undefined;
        if (this.isDuplicateFieldKey(value, this.insertingField.fieldLocation)) {
            return "The field already exists.";
        }
        return undefined;
    }

    // Rename
    handleRenameClick(headerType: HeaderType, fieldKey: string, fieldLocation: FieldLocation) {
        this.renamingField = { headerType, fieldKey, fieldLocation };
        setTimeout(() => {
            this.renameInput?.nativeElement?.focus();
        }, 0);
    }

    handleRenameKeyDown(event: KeyboardEvent) {
        const value = (event.target as HTMLInputElement).value;
        this.renameError = this.getRenameErrorMessage(value);
        const hasError = this.renameError !== undefined;
        const isSameName = value === this.renamingField?.fieldKey;
        const isEmpty = !value;

        if (event.key === "Enter" && (isSameName || isEmpty)) {
            this.renamingField = undefined;
            return;
        }
        if (event.key === "Escape") {
            this.renamingField = undefined;
            return;
        }
        if (event.key === "Enter" && !hasError) {
            this.isEnteringRename = true;
            this.newFieldName = value;
            this.isConfirmModalOpen = true;
            this.confirmOperation = "rename";
        }
    }

    handleRenameBlur() {
        if (this.isEnteringRename) {
            this.isEnteringRename = false;
            return;
        }
        this.renamingField = undefined;
    }

    getRenameErrorMessage(value: string): string | undefined {
        if (!this.renamingField) return undefined;
        if (this.renamingField.fieldKey === value) return undefined;
        if (this.isDuplicateFieldKey(value, this.renamingField.fieldLocation)) {
            return "The field already exists.";
        }
        return undefined;
    }

    handleRenameFieldConfirm() {
        if (!this.renamingField || !this.newFieldName) return;
        this.renameFieldEvent.emit({
            tableFieldKey: this.field.fieldKey,
            fieldKey: this.renamingField.fieldKey,
            newName: this.newFieldName,
            fieldLocation: this.renamingField.fieldLocation,
        });
        this.isConfirmModalOpen = false;
        this.confirmOperation = undefined;
        this.renamingField = undefined;
        this.newFieldName = undefined;
    }

    // Confirm modal
    onConfirmModalAction() {
        if (this.confirmOperation === "delete") {
            this.handleDeleteFieldConfirm();
        } else {
            this.handleRenameFieldConfirm();
        }
    }

    handleConfirmModalClose() {
        this.isConfirmModalOpen = false;
    }

    // Dynamic table row operations
    handleDynamicTableRowInsert(rowNumber: number) {
        const tableLabelsValues = Object.values(this.tableLabels);
        const firstLabelValue = tableLabelsValues[0];
        const tableFieldKey = firstLabelValue ? getFieldKeyFromLabel(firstLabelValue) : "";

        const labelsLessThanRowNumber = tableLabelsValues.filter(
            (label) => getDynamicTableRowNumberFromLabel(label) <= rowNumber
        );
        const labelsGreaterThanRowNumber = tableLabelsValues
            .filter((label) => getDynamicTableRowNumberFromLabel(label) > rowNumber)
            .map((label) => ({
                ...label,
                label: this.replaceTableRowNumberFromLabel(label, getDynamicTableRowNumberFromLabel(label) + 1),
            }));
        const newLabel = [...labelsLessThanRowNumber, ...labelsGreaterThanRowNumber];

        this.store.dispatch(updateTableLabel({ tableFieldKey, newLabel }));
        this.dynamicRows++;
    }

    handleDynamicTableRowDelete(rowNumber: number) {
        const tableLabelsValues = Object.values(this.tableLabels);
        const firstLabelValue = tableLabelsValues[0];
        const tableFieldKey = firstLabelValue ? getFieldKeyFromLabel(firstLabelValue) : "";

        const labelsLessThanRowNumber = tableLabelsValues.filter(
            (label) => getDynamicTableRowNumberFromLabel(label) < rowNumber
        );
        const labelsGreaterThanRowNumber = tableLabelsValues
            .filter((label) => getDynamicTableRowNumberFromLabel(label) > rowNumber)
            .map((label) => ({
                ...label,
                label: this.replaceTableRowNumberFromLabel(label, getDynamicTableRowNumberFromLabel(label) - 1),
            }));
        const newLabel = [...labelsLessThanRowNumber, ...labelsGreaterThanRowNumber];

        this.store.dispatch(updateTableLabel({ tableFieldKey, newLabel }));
        this.dynamicRows--;
    }

    private replaceTableRowNumberFromLabel(label: Label, replacement: number): string {
        const strings = label.label.split("/");
        strings[1] = replacement.toString();
        return strings.join("/");
    }

    private isDuplicateFieldKey(fieldKey: string, fieldLocation: FieldLocation): boolean {
        const objField = this.field as ObjectField;
        return fieldLocation === FieldLocation.field
            ? objField.fields?.some((f) => f.fieldKey === fieldKey) || false
            : this.definition.fields.some((f) => f.fieldKey === fieldKey);
    }
}
