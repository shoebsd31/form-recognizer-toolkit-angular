import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
    selector: "app-analyze-progress-bar",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="analyze-progress-bar">
            <p class="title">{{ title }}</p>
            <p class="subtitle">{{ subtitle }}</p>
            <div class="progress-track">
                <div
                    class="progress-fill"
                    [class.indeterminate]="percentComplete === undefined"
                    [style.width.%]="percentComplete !== undefined ? percentComplete * 100 : 0"
                ></div>
            </div>
        </div>
    `,
    styles: [
        `
            .analyze-progress-bar {
                padding: 16px;
                background: white;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                min-width: 300px;
            }
            .title {
                margin: 0 0 4px;
                font-weight: 600;
            }
            .subtitle {
                margin: 0 0 8px;
                font-size: 12px;
                color: #605e5c;
            }
            .progress-track {
                height: 4px;
                background: #edebe9;
                border-radius: 2px;
                overflow: hidden;
            }
            .progress-fill {
                height: 100%;
                background: #0078d4;
                border-radius: 2px;
                transition: width 0.3s ease;
            }
            .progress-fill.indeterminate {
                width: 30% !important;
                animation: indeterminate 1.5s infinite ease-in-out;
            }
            @keyframes indeterminate {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
            }
        `,
    ],
})
export class AnalyzeProgressBarComponent {
    @Input() title: string = "";
    @Input() subtitle: string = "";
    @Input() percentComplete?: number;
}
