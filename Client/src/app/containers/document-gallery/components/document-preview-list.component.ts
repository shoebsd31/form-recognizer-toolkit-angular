import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IDocument } from "../../../store/documents/documents.types";
import { DocumentPreviewComponent } from "./document-preview.component";

@Component({
    selector: "app-document-preview-list",
    standalone: true,
    imports: [CommonModule, DocumentPreviewComponent],
    template: `
        <div class="document-preview-list" #listContainer>
            <div *ngFor="let doc of documents; let i = index; trackBy: trackByName" class="list-item">
                <app-document-preview
                    [document]="doc"
                    [isSelected]="doc.name === currentDocument?.name"
                    (onClick)="documentClick.emit({ name: $event, index: i })"
                    (onDeleteClick)="documentDelete.emit({ name: $event, index: i })"
                ></app-document-preview>
            </div>
        </div>
    `,
    styles: [
        `
            :host {
                display: flex;
                width: 100%;
                height: 100%;
            }

            .document-preview-list {
                width: 100%;
                height: 100%;
                overflow-y: auto;
            }

            .list-item {
                margin-top: 8px;
            }
        `,
    ],
})
export class DocumentPreviewListComponent implements OnChanges {
    @Input() documents: IDocument[] = [];
    @Input() currentDocument: IDocument | null = null;

    @Output() documentClick = new EventEmitter<{ name: string; index: number }>();
    @Output() documentDelete = new EventEmitter<{ name: string; index: number }>();

    @ViewChild("listContainer") listContainer!: ElementRef<HTMLDivElement>;

    private readonly itemHeight = 124;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes["currentDocument"] && this.currentDocument) {
            this.scrollCurrentDocToTop();
        }
    }

    trackByName(_index: number, doc: IDocument): string {
        return doc.name;
    }

    private scrollCurrentDocToTop(): void {
        if (!this.currentDocument || !this.listContainer?.nativeElement) {
            return;
        }
        const index = this.documents.findIndex((doc) => doc.name === this.currentDocument!.name);
        if (index !== -1) {
            // Using setTimeout to ensure DOM is rendered before scrolling
            setTimeout(() => {
                const scrollTop = index * (this.itemHeight + 8); // item height + margin
                this.listContainer.nativeElement.scrollTo({ top: scrollTop, behavior: "smooth" });
            });
        }
    }
}
