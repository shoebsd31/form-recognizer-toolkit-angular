import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [],
  template: `
    <div class="loading-overlay">
      <div class="spinner">
        <svg viewBox="0 0 50 50">
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#0078d4"
            stroke-width="4"
            stroke-linecap="round"
          ></circle>
        </svg>
      </div>
      @if (message) {
      <p class="loading-label">{{ message }}</p>
      }
    </div>
  `,
  styleUrls: ['./loading-overlay.component.scss'],
})
export class LoadingOverlayComponent {
  @Input() message?: string;
}
