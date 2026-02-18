import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

export interface ChoiceOption {
    key: string;
    text: string;
}

@Component({
    selector: "app-horizontal-choice-group",
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="horizontal-choice-group">
            <label *ngIf="label" class="choice-group-label">
                {{ label }}<span *ngIf="required" class="required-indicator"> *</span>
            </label>
            <div class="choice-group-options">
                <div *ngFor="let option of options" class="choice-option">
                    <input
                        type="radio"
                        [name]="groupName"
                        [value]="option.key"
                        [checked]="selectedKey === option.key"
                        [disabled]="disabled"
                        [id]="groupName + '_' + option.key"
                        (change)="onSelectionChange(option.key)"
                    />
                    <label [for]="groupName + '_' + option.key" class="option-label">{{ option.text }}</label>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .horizontal-choice-group {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .choice-group-label {
                font-weight: 600;
                font-size: 14px;
            }
            .required-indicator {
                color: #a4262c;
            }
            .choice-group-options {
                display: flex;
                gap: 12px;
            }
            .choice-option {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .option-label {
                cursor: pointer;
                font-size: 14px;
            }
        `,
    ],
})
export class HorizontalChoiceGroupComponent {
    @Input() label: string = "";
    @Input() options: ChoiceOption[] = [];
    @Input() selectedKey: string = "";
    @Input() disabled: boolean = false;
    @Input() required: boolean = false;
    @Input() groupName: string = "choice-group";
    @Output() selectionChange = new EventEmitter<{ key: string }>();

    onSelectionChange(key: string) {
        this.selectionChange.emit({ key });
    }
}
