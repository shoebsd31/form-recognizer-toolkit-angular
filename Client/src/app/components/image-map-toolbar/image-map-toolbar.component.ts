import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
    selector: "app-image-map-toolbar",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="image-map-toolbar">
            <button class="btn-icon" [disabled]="disabled" (click)="onZoomInClick.emit()" title="Zoom in"><i class="pi pi-search-plus"></i></button>
            <button class="btn-icon" [disabled]="disabled" (click)="onZoomOutClick.emit()" title="Zoom out"><i class="pi pi-search-minus"></i></button>
            <button class="btn-icon" [disabled]="disabled" (click)="onZoomToFitClick.emit()" title="Zoom to fit"><i class="pi pi-arrows-alt"></i></button>
            <button class="btn-icon" [disabled]="disabled" (click)="onRotateClick.emit()" title="Rotate"><i class="pi pi-refresh"></i></button>
        </div>
    `,
    styles: [
        `
            .image-map-toolbar {
                display: flex;
                align-items: center;
                gap: 2px;
            }
        `,
    ],
})
export class ImageMapToolbarComponent {
    @Input() disabled: boolean = false;
    @Input() zoomRatio?: number;
    @Input() rotateAngle: number = 0;
    @Output() onZoomInClick = new EventEmitter<void>();
    @Output() onZoomOutClick = new EventEmitter<void>();
    @Output() onZoomToFitClick = new EventEmitter<void>();
    @Output() onRotateClick = new EventEmitter<void>();
}
