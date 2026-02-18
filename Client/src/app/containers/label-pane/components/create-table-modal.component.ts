import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DialogComponent } from "../../../components/dialog/dialog.component";
import { HorizontalChoiceGroupComponent } from "./horizontal-choice-group.component";
import { TableType, HeaderType } from "../../../models/custom-models";
import { constants } from "../../../consts/constants";

@Component({
    selector: "app-create-table-modal",
    standalone: true,
    imports: [CommonModule, FormsModule, DialogComponent, HorizontalChoiceGroupComponent],
    template: `
        <app-dialog
            header="Create table field"
            [(visible)]="isOpen"
            [dialogStyle]="{ width: '780px' }"
            (onHide)="handleCloseModal()"
        >
            <div class="create-table-modal-body">
                <div class="form-field">
                    <label for="name-textfield" class="field-label">
                        Name<span class="required-indicator"> *</span>
                    </label>
                    <input
                        id="name-textfield"
                        type="text"
                        [(ngModel)]="name"
                        (ngModelChange)="onNameChange()"
                        placeholder="Name your table"
                        autocomplete="off"
                        class="name-input input-text"
                    />
                    <div *ngIf="nameError" class="error-message">{{ nameError }}</div>
                </div>
                <div class="choice-fields">
                    <app-horizontal-choice-group
                        label="Table type"
                        [options]="typeOptions"
                        [selectedKey]="tableType"
                        [required]="true"
                        groupName="tableType"
                        (selectionChange)="handleTypeChange($event)"
                    ></app-horizontal-choice-group>
                    <app-horizontal-choice-group
                        label="Header type"
                        [options]="headerOptions"
                        [selectedKey]="headerType"
                        [disabled]="tableType === TableType.dynamic"
                        [required]="true"
                        groupName="headerType"
                        (selectionChange)="handleHeaderTypeChange($event)"
                    ></app-horizontal-choice-group>
                </div>
                <div class="table-description-container">
                    <p>{{ tableTypeDescription }}</p>
                    <img [src]="tableTypeImgSrc" [alt]="tableType + ' table'" class="table-type-image" />
                </div>
            </div>
            <ng-template #dialogFooter>
                <button class="btn-secondary" (click)="handleCloseModal()">Cancel</button>
                <button class="btn-primary" [disabled]="!isCreateValid()" (click)="handleCreateField()">Create</button>
            </ng-template>
        </app-dialog>
    `,
    styles: [
        `
            .create-table-modal-body {
                padding-right: 50px;
                min-height: 450px;
                display: flex;
                flex-direction: column;
                gap: 12px;

                .form-field {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .field-label {
                    font-weight: 600;
                    font-size: 14px;
                }

                .required-indicator {
                    color: #a4262c;
                }

                .name-input {
                    width: 100%;
                }

                .error-message {
                    color: #a4262c;
                    font-size: 12px;
                }

                .choice-fields {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .table-description-container {
                    margin-top: 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;

                    p {
                        text-align: center;
                    }
                }

                .table-type-image {
                    max-width: 650px;
                    max-height: 200px;
                    object-fit: cover;
                }
            }
        `,
    ],
})
export class CreateTableModalComponent {
    @Input() isOpen: boolean = false;
    @Output() isOpenChange = new EventEmitter<boolean>();
    @Output() close = new EventEmitter<void>();
    @Output() createFieldEvent = new EventEmitter<{
        fieldKey: string;
        tableType: TableType;
        headerType: HeaderType;
    }>();

    TableType = TableType;

    name: string = "";
    tableType: TableType | "" = TableType.dynamic;
    headerType: HeaderType | "" = "";
    nameError: string | undefined;

    getNameErrorMessage: ((value: string) => string | undefined) | undefined;

    typeOptions = [
        { key: TableType.dynamic, text: "Dynamic" },
        { key: TableType.fixed, text: "Fixed" },
    ];

    headerOptions = [
        { key: HeaderType.column, text: "Column" },
        { key: HeaderType.row, text: "Row" },
    ];

    get tableTypeDescription(): string {
        return this.tableType === TableType.dynamic
            ? "Use dynamic tables to extract variable count of values (rows) for a given set of fields (columns)."
            : "Use fixed tables to extract specific collection of values (rows) for a given set of fields (columns and/or rows).";
    }

    get tableTypeImgSrc(): string {
        return this.tableType === TableType.dynamic ? constants.dynamicTableImgSrc : constants.fixedTableImgSrc;
    }

    onNameChange() {
        if (this.getNameErrorMessage) {
            this.nameError = this.getNameErrorMessage(this.name);
        }
    }

    handleTypeChange(event: { key: string }) {
        this.tableType = event.key as TableType;
        this.headerType = event.key === TableType.dynamic ? "" : HeaderType.column;
    }

    handleHeaderTypeChange(event: { key: string }) {
        this.headerType = event.key as HeaderType;
    }

    handleCloseModal() {
        this.resetStates();
        this.isOpen = false;
        this.isOpenChange.emit(false);
        this.close.emit();
    }

    handleCreateField() {
        if (!this.isCreateValid()) return;
        this.createFieldEvent.emit({
            fieldKey: this.name,
            tableType: this.tableType as TableType,
            headerType: this.headerType as HeaderType,
        });
        this.handleCloseModal();
    }

    isCreateValid(): boolean {
        const nameHasError = this.getNameErrorMessage ? this.getNameErrorMessage(this.name) !== undefined : false;
        const isHeaderTypeValid = this.tableType === TableType.dynamic || !!this.headerType;
        return !!this.name && !nameHasError && !!this.tableType && isHeaderTypeValid;
    }

    private resetStates() {
        this.name = "";
        this.tableType = TableType.dynamic;
        this.headerType = "";
        this.nameError = undefined;
    }
}
