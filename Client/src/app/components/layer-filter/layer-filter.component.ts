import { Component, Input, Output, EventEmitter, HostListener, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";

export interface ILayerCheckStates {
    text: boolean;
    tables: boolean;
    selectionMarks: boolean;
}

export interface ILayerFilterItem {
    key: string;
    text: string;
    iconClass: string;
    checked: boolean;
}

@Component({
    selector: "app-layer-filter",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div style="position: relative; display: inline-block;">
            <button
                class="layer-filter-button"
                [disabled]="disabled"
                title="Choose extracted object to display"
                aria-label="Show extracted"
                (click)="toggleMenu()"
            >
                <i class="pi pi-sliders-h"></i>
            </button>

            <div *ngIf="isMenuOpen" class="layer-filter-menu">
                <div class="layer-filter-title">Show extracted</div>
                <div
                    *ngFor="let option of layerOptions"
                    class="layer-filter-item"
                    (click)="handleItemClick(option)"
                >
                    <label>
                        <input
                            type="checkbox"
                            [checked]="$any(checkStates)[option.key]"
                            (click)="$event.stopPropagation(); handleItemClick(option)"
                        />
                        <i [class]="option.iconClass"></i>
                        <span>{{ option.text }}</span>
                    </label>
                </div>
            </div>
        </div>
    `,
    styleUrls: ["./layer-filter.component.scss"],
})
export class LayerFilterComponent {
    @Input() disabled: boolean = false;
    @Input() checkStates: ILayerCheckStates = { text: true, tables: true, selectionMarks: true };
    @Output() itemClick = new EventEmitter<ILayerFilterItem>();

    isMenuOpen = false;

    readonly layerOptions: { key: string; text: string; iconClass: string }[] = [
        { key: "text", text: "Text", iconClass: "pi pi-align-left" },
        { key: "tables", text: "Tables", iconClass: "pi pi-table" },
        { key: "selectionMarks", text: "Selection marks", iconClass: "pi pi-check-square" },
    ];

    constructor(private elementRef: ElementRef) {}

    @HostListener("document:click", ["$event"])
    onDocumentClick(event: Event): void {
        if (!this.elementRef.nativeElement.contains(event.target)) {
            this.isMenuOpen = false;
        }
    }

    toggleMenu(): void {
        this.isMenuOpen = !this.isMenuOpen;
    }

    handleItemClick(option: { key: string; text: string; iconClass: string }): void {
        const item: ILayerFilterItem = {
            key: option.key,
            text: option.text,
            iconClass: option.iconClass,
            checked: !(this.checkStates as any)[option.key],
        };
        this.itemClick.emit(item);
    }
}
