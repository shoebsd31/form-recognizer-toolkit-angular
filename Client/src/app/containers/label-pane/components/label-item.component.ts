import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Store } from "@ngrx/store";
import { MessageModalComponent} from "../../../components/message-modal/message-modal.component";
import { Field, FieldType, Label, LabelType } from "../../../models/custom-models";
import { encodeLabelString } from "../../../utils/custom-model";
import { setColorForFieldsByName } from "../../../store/custom-model/custom-model.actions";

@Component({
    selector: "app-label-item",
    standalone: true,
    imports: [CommonModule, FormsModule, MessageModalComponent],
    template: `
        <div
            class="label-item"
            (click)="handleItemClick()"
            (mouseenter)="handleMouseEnter()"
            (mouseleave)="handleMouseLeave()"
        >
            <!-- Item Title -->
            <div class="label-item-entry no-select">
                <div class="drag-handle" [attr.cdkDragHandle]="true">
                    <i class="pi pi-bars"></i>
                </div>
                <i class="pi pi-circle-fill" [style.color]="color" style="font-size: 16px"></i>
                <ng-container *ngIf="isRenaming; else displayName">
                    <input
                        #renameInput
                        type="text"
                        [value]="field.fieldKey"
                        (keydown)="handleRenameFieldKeyDown($event)"
                        (blur)="handleRenameFieldBlur()"
                        (click)="$event.stopPropagation()"
                        autocomplete="off"
                        class="rename-input input-text"
                    />
                    <div *ngIf="renameError" class="rename-error">{{ renameError }}</div>
                </ng-container>
                <ng-template #displayName>
                    <span class="field-name">{{ field.fieldKey }}</span>
                </ng-template>
                <button
                    type="button"
                    class="btn-icon menu-button"
                    (click)="onMenuClick($event)"
                ><i class="pi pi-ellipsis-v"></i></button>
                <div
                    *ngIf="showMenu"
                    class="context-menu-overlay"
                    (click)="showMenu = false"
                ></div>
                <div *ngIf="showMenu" class="context-menu">
                    <div class="context-menu-item" (click)="handleRenameMenuClick($event)">Rename</div>
                    <div class="context-menu-item" (click)="handleDeleteMenuClick($event)">Delete</div>
                    <ng-container *ngIf="hasSubType">
                        <div class="context-menu-separator"></div>
                        <div class="context-menu-label">Sub type</div>
                        <div
                            *ngFor="let option of subTypeOptions"
                            class="context-menu-item"
                            [class.active]="field.fieldType === option.key"
                            (click)="handleSubTypeClick($event, option.key)"
                        >
                            <i *ngIf="field.fieldType === option.key" class="pi pi-check" style="margin-right: 4px"></i>
                            {{ option.text }}
                        </div>
                    </ng-container>
                </div>
            </div>
            <!-- Item Value -->
            <div *ngIf="label" class="label-item-result label-item-value">
                <div></div>
                <ng-container [ngSwitch]="true">
                    <i *ngSwitchCase="isTable" class="pi pi-table label-item-icon"></i>
                    <i *ngSwitchCase="field.fieldType === FieldType.Signature" class="pi pi-pencil label-item-icon"></i>
                    <ng-container *ngSwitchCase="field.fieldType === FieldType.SelectionMark">
                        <div class="selection-mark-value">
                            <i class="pi pi-check-square label-item-icon"></i>
                            <span *ngIf="labelText" class="label-item-text">{{ labelText }}</span>
                        </div>
                    </ng-container>
                    <i
                        *ngSwitchCase="label.labelType === LabelType.Region"
                        class="pi pi-pencil label-item-icon"
                    ></i>
                    <span *ngSwitchDefault class="label-item-text">{{ labelText }}</span>
                </ng-container>
                <button
                    type="button"
                    class="btn-icon delete-label-button"
                    (click)="handleDeleteLabel($event)"
                ><i class="pi pi-times"></i></button>
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
                    Are you sure you want to delete <b>{{ field.fieldKey }}</b
                    >? All labels and regions assigned to this field will be deleted.
                </ng-container>
                <ng-container *ngIf="confirmOperation === 'rename'">
                    Are you sure you want to rename <b>{{ field.fieldKey }}</b> to <b>{{ newFieldName }}</b
                    >? All labels and regions assigned to this field will be changed thoroughly.
                </ng-container>
            </app-message-modal>
        </div>
    `,
    styleUrls: ["./label-item.component.scss"],
})
export class LabelItemComponent {
    @Input() field!: Field;
    @Input() label?: Label;
    @Input() color: string = "#a19f9d";
    @Output() deleteLabel = new EventEmitter<string>();
    @Output() switchSubType = new EventEmitter<{ fieldKey: string; fieldType: FieldType }>();
    @Output() deleteField = new EventEmitter<string>();
    @Output() renameField = new EventEmitter<{ oldName: string; newName: string }>();
    @Output() clickTableField = new EventEmitter<Field>();
    @Output() clickField = new EventEmitter<string>();
    @Output() itemMouseEnter = new EventEmitter<string>();
    @Output() itemMouseLeave = new EventEmitter<void>();
    @Input() getRenameErrorMessage!: (value: string) => string | undefined;

    @ViewChild("renameInput") renameInput!: ElementRef<HTMLInputElement>;

    FieldType = FieldType;
    LabelType = LabelType;

    isConfirmModalOpen = false;
    isConfirmModalLoading = false;
    isRenaming = false;
    confirmOperation: "delete" | "rename" | undefined;
    newFieldName: string | undefined;
    renameError: string | undefined;
    showMenu = false;
    isEnteringRename = false;

    subTypeOptions = [
        { key: FieldType.String, text: "String" },
        { key: FieldType.Number, text: "Number" },
        { key: FieldType.Date, text: "Date" },
        { key: FieldType.Time, text: "Time" },
        { key: FieldType.Integer, text: "Integer" },
    ];

    constructor(private store: Store) {}

    get hasSubType(): boolean {
        return (
            this.field.fieldType !== FieldType.SelectionMark &&
            this.field.fieldType !== FieldType.Signature &&
            this.field.fieldType !== FieldType.Array &&
            this.field.fieldType !== FieldType.Object
        );
    }

    get isTable(): boolean {
        return this.field.fieldType === FieldType.Array || this.field.fieldType === FieldType.Object;
    }

    get labelText(): string {
        if (!this.label) return "";
        return this.label.value.map((v) => v.text).join(" ");
    }

    get confirmModalTitle(): string {
        return this.confirmOperation === "delete" ? "Delete Field" : "Rename Field";
    }

    handleItemClick() {
        if (this.isTable) {
            this.clickTableField.emit(this.field);
        } else {
            this.clickField.emit(encodeLabelString(this.field.fieldKey));
        }
    }

    handleMouseEnter() {
        if (this.label && this.label.value && this.label.value.length > 0) {
            this.itemMouseEnter.emit(this.label.label || "");
        }
    }

    handleMouseLeave() {
        this.itemMouseLeave.emit();
    }

    handleDeleteLabel(event: Event) {
        event.stopPropagation();
        this.deleteLabel.emit(this.field.fieldKey);
    }

    onMenuClick(event: Event) {
        event.stopPropagation();
        this.showMenu = !this.showMenu;
    }

    handleSubTypeClick(event: Event, type: FieldType) {
        event.stopPropagation();
        this.showMenu = false;
        this.switchSubType.emit({ fieldKey: this.field.fieldKey, fieldType: type });
    }

    handleDeleteMenuClick(event: Event) {
        event.stopPropagation();
        this.showMenu = false;
        this.isConfirmModalOpen = true;
        this.confirmOperation = "delete";
    }

    handleRenameMenuClick(event: Event) {
        event.stopPropagation();
        this.showMenu = false;
        this.isRenaming = true;
        setTimeout(() => {
            this.renameInput?.nativeElement?.focus();
        }, 0);
    }

    handleRenameFieldKeyDown(event: KeyboardEvent) {
        event.stopPropagation();
        const value = (event.target as HTMLInputElement).value;
        this.renameError = this.handleRenameErrorMessage(value);
        const hasError = this.renameError !== undefined;
        const isSameName = value === this.field.fieldKey;
        const isEmpty = !value;

        if (event.key === "Enter" && (isSameName || isEmpty)) {
            this.isRenaming = false;
            return;
        }

        if (event.key === "Escape") {
            this.isRenaming = false;
            return;
        }

        if (event.key === "Enter" && !hasError) {
            this.isEnteringRename = true;
            this.newFieldName = value;
            this.isConfirmModalOpen = true;
            this.confirmOperation = "rename";
        }
    }

    handleRenameFieldBlur() {
        if (this.isEnteringRename) {
            this.isEnteringRename = false;
            return;
        }
        this.isRenaming = false;
    }

    handleRenameErrorMessage(value: string): string | undefined {
        if (value === this.field.fieldKey) {
            return undefined;
        }
        return this.getRenameErrorMessage ? this.getRenameErrorMessage(value) : undefined;
    }

    onConfirmModalAction() {
        if (this.confirmOperation === "delete") {
            this.handleDeleteFieldConfirm();
        } else {
            this.handleRenameFieldConfirm();
        }
    }

    handleDeleteFieldConfirm() {
        this.deleteField.emit(this.field.fieldKey);
        this.isConfirmModalOpen = false;
        this.confirmOperation = undefined;
    }

    handleRenameFieldConfirm() {
        if (this.newFieldName) {
            this.store.dispatch(
                setColorForFieldsByName({
                    fieldName: this.field.fieldKey,
                    newFieldName: this.newFieldName,
                })
            );
            this.renameField.emit({ oldName: this.field.fieldKey, newName: this.newFieldName });
        }
        this.isConfirmModalOpen = false;
        this.isRenaming = false;
        this.confirmOperation = undefined;
        this.newFieldName = undefined;
    }

    handleConfirmModalClose() {
        this.isConfirmModalOpen = false;
    }
}
