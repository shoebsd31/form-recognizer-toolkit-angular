import { Component, Input, Output, EventEmitter, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngrx/store";
import { Observable, Subject, combineLatest } from "rxjs";
import { takeUntil, distinctUntilChanged } from "rxjs/operators";
import { IDocument, DocumentStatus } from "../../store/documents/documents.types";
import { selectDocuments, selectCurrentDocument } from "../../store/documents/documents.selectors";
import {
    setCurrentDocument,
    deleteDocument,
    clearCurrentDocument,
} from "../../store/documents/documents.actions";
import { DocumentPreviewListComponent } from "./components/document-preview-list.component";
import { MessageModalComponent } from "../../components/message-modal/message-modal.component";

@Component({
    selector: "app-document-gallery",
    standalone: true,
    imports: [CommonModule, DocumentPreviewListComponent, MessageModalComponent],
    template: `
        <div class="document-gallery-container">
            <div class="document-gallery-list">
                <app-document-preview-list
                    [documents]="(documents$ | async) || []"
                    [currentDocument]="(currentDocument$ | async) ?? null"
                    (documentClick)="handleDocumentClick($event)"
                    (documentDelete)="handleDocumentDeleteClicked($event)"
                ></app-document-preview-list>
            </div>

            <app-message-modal
                *ngIf="isDeleteModalOpen"
                [isOpen]="isDeleteModalOpen"
                [title]="'Delete Document'"
                [actionButtonText]="'Delete'"
                (onActionButtonClick)="handleConfirmDocumentDeletion()"
                (onClose)="isDeleteModalOpen = false"
            >
                <p>
                    Labels and OCR results associated with this file will be deleted as well.
                    Are you sure to delete {{ documentToDelete?.name }}?
                </p>
            </app-message-modal>
        </div>
    `,
    styleUrls: ["./document-gallery.component.scss"],
})
export class DocumentGalleryComponent implements OnDestroy {
    @Input() hideAddButton = false;
    @Input() shouldConfirmDeleteDocument = false;
    @Output() documentDeleted = new EventEmitter<IDocument>();

    documents$: Observable<IDocument[]>;
    currentDocument$: Observable<IDocument | null>;

    isDeleteModalOpen = false;
    documentToDelete: { name: string; index: number } | null = null;

    private destroy$ = new Subject<void>();

    constructor(private store: Store) {
        this.documents$ = this.store.select(selectDocuments);
        this.currentDocument$ = this.store.select(selectCurrentDocument);

        // Auto-select first document if none is selected and first document is loaded
        combineLatest([this.documents$, this.currentDocument$])
            .pipe(takeUntil(this.destroy$), distinctUntilChanged())
            .subscribe(([documents, currentDocument]) => {
                if (
                    documents &&
                    documents[0] &&
                    documents[0].states.loadingStatus === DocumentStatus.Loaded &&
                    !currentDocument
                ) {
                    this.store.dispatch(setCurrentDocument({ document: documents[0] }));
                }
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    handleDocumentClick(event: { name: string; index: number }): void {
        let documents: IDocument[] = [];
        this.documents$.pipe(takeUntil(this.destroy$)).subscribe((docs) => (documents = docs));

        const selectedDoc = documents.find((doc) => doc.name === event.name);
        if (selectedDoc) {
            this.store.dispatch(setCurrentDocument({ document: selectedDoc }));
        }
    }

    handleDocumentDeleteClicked(event: { name: string; index: number }): void {
        if (this.shouldConfirmDeleteDocument) {
            this.documentToDelete = { name: event.name, index: event.index };
            this.isDeleteModalOpen = true;
        } else {
            this.executeDocumentDelete(event.name, event.index);
        }
    }

    handleConfirmDocumentDeletion(): void {
        if (this.documentToDelete) {
            this.executeDocumentDelete(this.documentToDelete.name, this.documentToDelete.index);
            this.documentToDelete = null;
            this.isDeleteModalOpen = false;
        }
    }

    private executeDocumentDelete(docNameToDelete: string, index: number): void {
        let documents: IDocument[] = [];
        let currentDoc: IDocument | null = null;

        this.documents$.subscribe((docs) => (documents = docs)).unsubscribe();
        this.currentDocument$.subscribe((doc) => (currentDoc = doc)).unsubscribe();

        if (currentDoc && (currentDoc as IDocument).name === docNameToDelete) {
            this.setCurrentDocumentToNextOrPrevious(documents, index);
        }

        const docToDelete = documents.find((doc) => doc.name === docNameToDelete);
        if (docToDelete) {
            this.store.dispatch(deleteDocument({ document: docToDelete }));
            this.documentDeleted.emit(docToDelete);
        }
    }

    private setCurrentDocumentToNextOrPrevious(documents: IDocument[], docIndexToDelete: number): void {
        if (documents.length === 1) {
            this.store.dispatch(clearCurrentDocument());
            return;
        }

        let nextDocument: IDocument;
        if (docIndexToDelete + 1 === documents.length) {
            nextDocument = documents[docIndexToDelete - 1];
        } else {
            nextDocument = documents[docIndexToDelete + 1];
        }
        this.store.dispatch(setCurrentDocument({ document: nextDocument }));
    }
}
