import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";


@Component({
    selector: "app-close-button",
    standalone: true,
    imports: [CommonModule],
    template: `
        <button
            class="close-button"
            aria-label="Close"
            (click)="onClick.emit()"
        >
            <i class="pi pi-times"></i>
        </button>
    `,
    styles: [
        `
            .close-button {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #605e5c;
                background: transparent;
                border: none;
                cursor: pointer;
                padding: 4px;
                font-size: 16px;
            }
            .close-button:hover,
            .close-button:active {
                color: #323130;
            }
        `,
    ],
})
export class CloseButtonComponent {
    @Output() onClick = new EventEmitter<void>();
}

@Component({
    selector: "app-default-icon-button",
    standalone: true,
    imports: [CommonModule],
    template: `
        <button
            class="default-icon-button"
            [title]="title || ''"
            [attr.aria-label]="ariaLabel || title || ''"
            [disabled]="disabled"
            (click)="onClick.emit()"
        >
            <i [class]="'pi ' + iconName"></i>
        </button>
    `,
    styles: [
        `
            .default-icon-button {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #323130;
                background: transparent;
                border: none;
                cursor: pointer;
                padding: 4px 8px;
                font-size: 16px;
            }
            .default-icon-button:hover {
                color: #323130;
                background-color: #f3f2f1;
            }
            .default-icon-button:disabled {
                color: #a19f9d;
                background-color: transparent;
                cursor: default;
            }
        `,
    ],
})
export class DefaultIconButtonComponent {
    @Input() iconName: string = "";
    @Input() disabled: boolean = false;
    @Input() title?: string;
    @Input() ariaLabel?: string;
    @Output() onClick = new EventEmitter<void>();
}

@Component({
    selector: "app-draw-region-button",
    standalone: true,
    imports: [CommonModule],
    template: `
        <button
            class="draw-region-btn"
            [class.active]="checked"
            [disabled]="disabled"
            (click)="onClick.emit()"
            aria-label="Draw Region"
        >
            <i class="pi pi-pencil"></i>
            <span>Region</span>
        </button>
    `,
    styles: [
        `
            :host {
                display: inline-block;
            }
            .draw-region-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border: 1px solid #8a8886;
                border-radius: 4px;
                background: white;
                color: #323130;
                cursor: pointer;
                font-size: 14px;
            }
            .draw-region-btn:hover {
                background-color: #f3f2f1;
            }
            .draw-region-btn.active {
                background-color: #0078d4;
                color: white;
                border-color: #0078d4;
            }
            .draw-region-btn:disabled {
                background-color: #f3f2f1;
                color: #a19f9d;
                border-color: #f3f2f1;
                cursor: default;
            }
        `,
    ],
})
export class DrawRegionButtonComponent {
    @Input() disabled: boolean = false;
    @Input() checked: boolean = false;
    @Output() onClick = new EventEmitter<void>();
}
