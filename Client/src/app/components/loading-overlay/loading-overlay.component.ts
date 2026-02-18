import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
    selector: "app-loading-overlay",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="loading-overlay">
            <div class="spinner">
                <svg viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="#0078d4" stroke-width="4" stroke-linecap="round"></circle>
                </svg>
            </div>
            <p class="loading-label" *ngIf="message">{{ message }}</p>
        </div>
    `,
    styleUrls: ["./loading-overlay.component.scss"],
})
export class LoadingOverlayComponent {
    @Input() message?: string;
}
