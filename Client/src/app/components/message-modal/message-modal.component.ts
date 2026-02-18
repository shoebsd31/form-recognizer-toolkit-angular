import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DialogComponent } from "../dialog/dialog.component";

@Component({
    selector: "app-message-modal",
    standalone: true,
    imports: [CommonModule, DialogComponent],
    template: `
        <app-dialog
            [header]="title"
            [(visible)]="isOpen"
            [dialogStyle]="{ width: '560px' }"
            (onHide)="onClose.emit()"
        >
            <ng-content></ng-content>
            <ng-template #dialogFooter>
                <button *ngIf="rejectButtonText" class="btn-secondary" (click)="onClose.emit()">{{ rejectButtonText }}</button>
                <button *ngIf="actionButtonText" class="btn-primary" (click)="onActionButtonClick.emit()">{{ actionButtonText }}</button>
            </ng-template>
        </app-dialog>
    `,
})
export class MessageModalComponent {
    @Input() isOpen: boolean = false;
    @Input() title: string = "";
    @Input() actionButtonText?: string;
    @Input() rejectButtonText?: string;
    @Output() onClose = new EventEmitter<void>();
    @Output() onActionButtonClick = new EventEmitter<void>();
}
