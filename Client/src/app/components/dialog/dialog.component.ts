import { Component, Input, Output, EventEmitter, ContentChild, TemplateRef } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
    selector: "app-dialog",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="dialog-backdrop" *ngIf="visible" (mousedown)="onBackdropClick()">
            <div class="dialog-panel" [ngStyle]="dialogStyle" (mousedown)="$event.stopPropagation()">
                <div class="dialog-header">
                    <span class="dialog-title">{{ header }}</span>
                    <button *ngIf="closable" class="dialog-close-btn" (click)="hide()">
                        <i class="pi pi-times"></i>
                    </button>
                </div>
                <div class="dialog-content">
                    <ng-content></ng-content>
                </div>
                <div class="dialog-footer" *ngIf="footerRef">
                    <ng-container *ngTemplateOutlet="footerRef"></ng-container>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .dialog-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.4);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .dialog-panel {
                background: white;
                border-radius: 4px;
                box-shadow:
                    0 11px 15px -7px rgba(0, 0, 0, 0.2),
                    0 24px 38px 3px rgba(0, 0, 0, 0.14),
                    0 9px 46px 8px rgba(0, 0, 0, 0.12);
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }
            .dialog-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 24px;
                border-bottom: 1px solid #edebe9;
            }
            .dialog-title {
                font-size: 20px;
                font-weight: 600;
                color: #323130;
            }
            .dialog-close-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                cursor: pointer;
                padding: 4px;
                color: #605e5c;
                font-size: 16px;
            }
            .dialog-close-btn:hover {
                color: #323130;
            }
            .dialog-content {
                padding: 16px 24px;
                overflow: auto;
                flex: 1;
            }
            .dialog-footer {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                padding: 12px 24px;
                border-top: 1px solid #edebe9;
            }
        `,
    ],
})
export class DialogComponent {
    @Input() visible: boolean = false;
    @Input() header: string = "";
    @Input() closable: boolean = true;
    @Input() dialogStyle: { [key: string]: string } = {};
    @Output() visibleChange = new EventEmitter<boolean>();
    @Output() onHide = new EventEmitter<void>();
    @ContentChild("dialogFooter") footerRef?: TemplateRef<any>;

    hide(): void {
        this.visible = false;
        this.visibleChange.emit(false);
        this.onHide.emit();
    }

    onBackdropClick(): void {
        if (this.closable) {
            this.hide();
        }
    }
}
