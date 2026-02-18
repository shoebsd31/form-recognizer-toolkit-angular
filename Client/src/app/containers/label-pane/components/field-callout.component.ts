import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
    selector: "app-field-callout",
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div *ngIf="isVisible">
            <div class="callout-backdrop" (click)="hide()"></div>
            <div class="callout-panel" [style.width.px]="width">
                <div class="textfield-container">
                    <input
                        #fieldInput
                        type="text"
                        placeholder="Create new field and hit enter"
                        (keydown)="onTextFieldKeyDown($event)"
                        (input)="onInputChange($event)"
                        autocomplete="off"
                        class="field-input input-text"
                    />
                    <div *ngIf="errorMessage" class="error-message">{{ errorMessage }}</div>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .callout-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 999;
            }
            .callout-panel {
                position: absolute;
                right: 0;
                top: 100%;
                z-index: 1000;
                background: white;
                border: 1px solid #edebe9;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                border-radius: 4px;
            }
            .textfield-container {
                padding: 10px;
            }
            .field-input {
                width: 100%;
            }
            .error-message {
                color: #a4262c;
                font-size: 12px;
                margin-top: 4px;
            }
        `,
    ],
})
export class FieldCalloutComponent {
    @Input() width: number = 268;
    @Output() createField = new EventEmitter<string>();
    @Output() dismiss = new EventEmitter<void>();

    @ViewChild("fieldInput") fieldInput!: ElementRef<HTMLInputElement>;

    isVisible = false;
    errorMessage: string | undefined;
    getErrorMessage: ((value: string) => string | undefined) | undefined;

    show(event: Event, errorMessageFn?: (value: string) => string | undefined) {
        this.getErrorMessage = errorMessageFn;
        this.isVisible = true;
        setTimeout(() => {
            this.fieldInput?.nativeElement?.focus();
        }, 100);
    }

    hide() {
        this.isVisible = false;
        this.onDismiss();
    }

    onInputChange(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        if (this.getErrorMessage) {
            this.errorMessage = this.getErrorMessage(value);
        }
    }

    onTextFieldKeyDown(event: KeyboardEvent) {
        const value = (event.target as HTMLInputElement).value;
        if (this.getErrorMessage) {
            this.errorMessage = this.getErrorMessage(value);
        }
        const hasError = this.errorMessage !== undefined;

        if (event.key === "Enter" && !hasError && value) {
            this.createField.emit(value);
            this.hide();
        }

        if (event.key === "Escape") {
            this.hide();
        }
    }

    onDismiss() {
        this.errorMessage = undefined;
        this.dismiss.emit();
    }
}
