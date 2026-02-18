import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
    selector: "app-page-control",
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="page-control">
            <button class="btn-icon" [disabled]="disabled || isPreviousDisabled()" (click)="onPreviousClick.emit()" title="Previous page"><i class="pi pi-chevron-left"></i></button>
            <div class="page-number">
                <div class="current-page">
                    <input
                        type="number"
                        [disabled]="disabled || isPageInputDisabled()"
                        [value]="displayPage"
                        (change)="onDisplayPageChange($event)"
                        (keypress)="onPageEnter($event)"
                        style="width: 60px; text-align: center"
                        aria-label="Current page"
                    />
                </div>
                <div class="total-page">{{ getNumPageString() }}</div>
            </div>
            <button class="btn-icon" [disabled]="disabled || isNextDisabled()" (click)="onNextClick.emit()" title="Next page"><i class="pi pi-chevron-right"></i></button>
        </div>
    `,
    styleUrls: ["./page-control.component.scss"],
})
export class PageControlComponent implements OnChanges {
    @Input() disabled: boolean = false;
    @Input() currentPage?: number;
    @Input() numPages?: number;
    @Output() onPageChange = new EventEmitter<number>();
    @Output() onPreviousClick = new EventEmitter<void>();
    @Output() onNextClick = new EventEmitter<void>();

    displayPage: number = 0;
    private inputTimer: any;
    private INPUT_CHANGE_DELAY = 400;

    ngOnChanges(changes: SimpleChanges) {
        if (changes["currentPage"] && this.currentPage) {
            this.displayPage = this.currentPage;
        }
    }

    getNumPageString(): string {
        return this.numPages ? `of ${this.numPages}` : "of ##";
    }

    isPageInputDisabled(): boolean {
        return this.numPages === 1 || !this.displayPage;
    }

    isPreviousDisabled(): boolean {
        return this.displayPage === 1 || !this.displayPage;
    }

    isNextDisabled(): boolean {
        return this.displayPage === this.numPages || !this.displayPage;
    }

    onDisplayPageChange(event: any): void {
        const page = parseInt(event.target.value);
        if (this.numPages && page > 0 && page <= this.numPages) {
            this.displayPage = page;
            this.delayPageChange(page);
        }
    }

    onPageEnter(event: KeyboardEvent): void {
        if (event.key === "Enter") {
            (event.target as HTMLInputElement).blur();
        }
    }

    private delayPageChange(page: number): void {
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
        }
        this.inputTimer = setTimeout(() => {
            this.onPageChange.emit(page);
        }, this.INPUT_CHANGE_DELAY);
    }
}
