import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  ChangeDetectorRef,
  ElementRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  IDocument,
  DocumentStatus,
} from '../../store/documents/documents.types';
import {
  selectDocuments,
  selectCurrentDocument,
} from '../../store/documents/documents.selectors';
import {
  setCurrentDocument,
  setCurrentPage,
  deleteDocument,
  clearCurrentDocument,
} from '../../store/documents/documents.actions';
import { getDocumentLoader } from '../../utils/document-loader/loader-cache';
import { MessageModalComponent } from '../../components/message-modal/message-modal.component';

const THUMBNAIL_WIDTH = 140;

/**
 * Left sidebar of the labeling page.
 *
 * Top: a document picker (previous/next and a filterable list of names). Listing
 * documents downloads nothing, so it stays fast with large folders.
 * Below: thumbnails of the pages of the open document; click one to go to that page.
 */
@Component({
  selector: 'app-document-gallery',
  standalone: true,
  imports: [MessageModalComponent],
  template: `
    <div class="gallery">
      <div class="doc-picker">
        <div class="doc-picker-row">
          <button
            type="button"
            class="icon-button"
            title="Previous document"
            aria-label="Previous document"
            [disabled]="currentIndex <= 0"
            (click)="selectByOffset(-1)"
          >
            <i class="pi pi-chevron-left"></i>
          </button>
          <button
            #pickerToggle
            type="button"
            class="doc-picker-toggle"
            [class.open]="isPickerOpen"
            [attr.aria-expanded]="isPickerOpen"
            aria-haspopup="listbox"
            [title]="currentDocument?.name ?? 'Select a document'"
            (click)="togglePicker()"
          >
            <span class="status-dot" [class]="statusClass(currentDocument)"></span>
            <span class="doc-name">{{
              currentDocument?.name ?? 'Select a document'
            }}</span>
            <i class="pi" [class.pi-chevron-down]="!isPickerOpen" [class.pi-chevron-up]="isPickerOpen"></i>
          </button>
          <button
            type="button"
            class="icon-button"
            title="Next document"
            aria-label="Next document"
            [disabled]="currentIndex < 0 || currentIndex >= documents.length - 1"
            (click)="selectByOffset(1)"
          >
            <i class="pi pi-chevron-right"></i>
          </button>
        </div>
        <div class="doc-picker-count">
          @if (documents.length) { Document {{ currentIndex + 1 }} of
          {{ documents.length }} } @else { No documents }
        </div>
      </div>

      @if (isPickerOpen) {
      <div class="doc-panel">
        <input
          #filterInput
          type="search"
          class="doc-filter"
          placeholder="Filter documents"
          aria-label="Filter documents"
          [value]="filter"
          (input)="setFilter($any($event.target).value)"
          (keydown.enter)="selectFirstMatch()"
          (keydown.escape)="closePicker()"
        />
        <ul class="doc-list" role="listbox" aria-label="Documents">
          @for (doc of filteredDocuments; track doc.name) {
          <li
            role="option"
            class="doc-item"
            tabindex="0"
            [class.selected]="doc.name === currentDocument?.name"
            [attr.aria-selected]="doc.name === currentDocument?.name"
            [title]="doc.name"
            (click)="selectDocument(doc)"
            (keydown.enter)="selectDocument(doc)"
          >
            <span class="status-dot" [class]="statusClass(doc)"></span>
            <span class="doc-name">{{ doc.name }}</span>
            <button
              type="button"
              class="doc-delete"
              title="Delete document"
              [attr.aria-label]="'Delete ' + doc.name"
              (click)="handleDocumentDeleteClicked(doc, $event)"
            >
              <i class="pi pi-trash"></i>
            </button>
          </li>
          } @empty {
          <li class="doc-empty">No documents match</li>
          }
        </ul>
      </div>
      }

      <div class="page-strip" #pageStrip>
        @if (currentDocument && currentDocument.numPages > 0) { @for (page of
        pages; track page) {
        <button
          type="button"
          class="page-thumb"
          [class.selected]="page === currentDocument.currentPage"
          [attr.aria-current]="page === currentDocument.currentPage ? 'page' : null"
          [attr.aria-label]="'Page ' + page"
          [attr.data-page]="page"
          (click)="goToPage(page)"
        >
          @if (thumbnails[page]) {
          <img [src]="thumbnails[page]" [alt]="'Page ' + page" />
          } @else {
          <span class="page-placeholder"><i class="pi pi-file"></i></span>
          }
          <span class="page-number">{{ page }}</span>
        </button>
        } } @else if (currentDocument) {
        <div class="page-strip-message">Loading pages…</div>
        }
      </div>

      @if (isDeleteModalOpen) {
      <app-message-modal
        [isOpen]="isDeleteModalOpen"
        [title]="'Delete Document'"
        [actionButtonText]="'Delete'"
        (onActionButtonClick)="handleConfirmDocumentDeletion()"
        (onClose)="isDeleteModalOpen = false"
      >
        <p>
          Labels and OCR results associated with this file will be deleted as
          well. Are you sure to delete {{ documentToDelete?.name }}?
        </p>
      </app-message-modal>
      }
    </div>
  `,
  styleUrls: ['./document-gallery.component.scss'],
})
export class DocumentGalleryComponent implements OnDestroy {
  @Input() hideAddButton = false;
  @Input() shouldConfirmDeleteDocument = false;
  @Output() documentDeleted = new EventEmitter<IDocument>();

  @ViewChild('filterInput') filterInput?: ElementRef<HTMLInputElement>;
  @ViewChild('pageStrip') pageStrip?: ElementRef<HTMLDivElement>;

  documents: IDocument[] = [];
  currentDocument: IDocument | null = null;
  currentIndex = -1;

  isPickerOpen = false;
  filter = '';
  filteredDocuments: IDocument[] = [];

  pages: number[] = [];
  thumbnails: Record<number, string> = {};

  isDeleteModalOpen = false;
  documentToDelete: { name: string; index: number } | null = null;

  /** Rendered thumbnails per document URL, kept for the session so switching back is instant. */
  private thumbnailCache = new Map<string, Record<number, string>>();
  private thumbnailsFor: string | null = null;
  private thumbnailRun = 0;
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>
  ) {
    combineLatest([
      this.store.select(selectDocuments),
      this.store.select(selectCurrentDocument),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([documents, currentDocument]) => {
        const prevPage = this.currentDocument?.currentPage;
        this.documents = documents ?? [];
        this.currentDocument = currentDocument;
        this.currentIndex = currentDocument
          ? this.documents.findIndex((d) => d.name === currentDocument.name)
          : -1;
        this.applyFilter();

        // Open the first document once the list arrives.
        const first = this.documents[0];
        if (
          first &&
          !currentDocument &&
          first.states.loadingStatus === DocumentStatus.Loaded
        ) {
          this.store.dispatch(setCurrentDocument({ document: first }));
        }

        this.syncPages();
        if (currentDocument && currentDocument.currentPage !== prevPage) {
          this.scrollPageIntoView(currentDocument.currentPage);
        }
        // the app can run without zone.js: mark the view after store updates
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.thumbnailRun++;
    this.thumbnailCache.forEach((thumbs) =>
      Object.values(thumbs).forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      })
    );
  }

  // -- Document picker --

  @HostListener('document:click', ['$event'])
  handleOutsideClick(event: MouseEvent): void {
    if (
      this.isPickerOpen &&
      !event.composedPath().includes(this.host.nativeElement)
    ) {
      this.closePicker();
    }
  }

  @HostListener('keydown.escape')
  closePicker(): void {
    if (!this.isPickerOpen) return;
    this.isPickerOpen = false;
    this.cdr.markForCheck();
  }

  togglePicker(): void {
    if (this.isPickerOpen) {
      this.closePicker();
      return;
    }
    this.isPickerOpen = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.filterInput?.nativeElement.focus();
      this.host.nativeElement
        .querySelector('.doc-item.selected')
        ?.scrollIntoView({ block: 'center' });
    });
  }

  setFilter(value: string): void {
    this.filter = value;
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.filter.trim().toLowerCase();
    this.filteredDocuments = q
      ? this.documents.filter((d) => d.name.toLowerCase().includes(q))
      : this.documents;
  }

  selectFirstMatch(): void {
    if (this.filteredDocuments[0]) this.selectDocument(this.filteredDocuments[0]);
  }

  selectDocument(doc: IDocument): void {
    this.isPickerOpen = false;
    this.setFilter('');
    if (doc.name !== this.currentDocument?.name) {
      this.store.dispatch(setCurrentDocument({ document: doc }));
    }
    this.cdr.markForCheck();
  }

  selectByOffset(offset: number): void {
    const next = this.documents[this.currentIndex + offset];
    if (next) this.selectDocument(next);
  }

  statusClass(doc: IDocument | null): string {
    if (!doc) return 'status-dot';
    if (doc.states.labelingStatus === DocumentStatus.Labeled)
      return 'status-dot labeled';
    if (doc.states.analyzingStatus === DocumentStatus.Analyzing)
      return 'status-dot analyzing';
    if (doc.states.analyzingStatus === DocumentStatus.Analyzed)
      return 'status-dot analyzed';
    return 'status-dot';
  }

  // -- Pages of the open document --

  goToPage(page: number): void {
    if (this.currentDocument && page !== this.currentDocument.currentPage) {
      this.store.dispatch(setCurrentPage({ pageNumber: page }));
    }
  }

  private syncPages(): void {
    const doc = this.currentDocument;
    const numPages = doc?.numPages ?? 0;
    if (this.pages.length !== numPages) {
      this.pages = Array.from({ length: numPages }, (_, i) => i + 1);
    }
    const key = doc && numPages > 0 ? doc.url : null;
    if (key === this.thumbnailsFor) return;
    this.thumbnailsFor = key;
    this.thumbnails = key ? this.thumbnailCache.get(key) ?? {} : {};
    if (doc && key) this.renderThumbnails(doc, this.thumbnails);
    if (doc) this.scrollPageIntoView(doc.currentPage, 'auto');
  }

  /** Renders the missing thumbnails one page at a time; stops when another document opens. */
  private async renderThumbnails(
    doc: IDocument,
    thumbs: Record<number, string>
  ): Promise<void> {
    const run = ++this.thumbnailRun;
    this.thumbnailCache.set(doc.url, thumbs);
    try {
      const loader = await getDocumentLoader(doc);
      // current page first, then the rest in order
      const order = [
        doc.currentPage,
        ...this.pages.filter((p) => p !== doc.currentPage),
      ];
      for (const page of order) {
        if (run !== this.thumbnailRun) return;
        if (thumbs[page]) continue;
        thumbs[page] = await loader.loadPageThumbnail(page, THUMBNAIL_WIDTH);
        if (run === this.thumbnailRun) {
          this.thumbnails = { ...thumbs };
          this.cdr.markForCheck();
        }
      }
    } catch {
      /* placeholders stay; the page itself still opens from the canvas */
    }
  }

  private scrollPageIntoView(
    page: number,
    behavior: ScrollBehavior = 'smooth'
  ): void {
    setTimeout(() => {
      this.pageStrip?.nativeElement
        .querySelector(`[data-page="${page}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior });
    });
  }

  // -- Delete --

  handleDocumentDeleteClicked(doc: IDocument, event: Event): void {
    event.stopPropagation();
    const index = this.documents.findIndex((d) => d.name === doc.name);
    if (this.shouldConfirmDeleteDocument) {
      this.documentToDelete = { name: doc.name, index };
      this.isDeleteModalOpen = true;
      this.isPickerOpen = false;
    } else {
      this.executeDocumentDelete(doc.name, index);
    }
    this.cdr.markForCheck();
  }

  handleConfirmDocumentDeletion(): void {
    if (this.documentToDelete) {
      this.executeDocumentDelete(
        this.documentToDelete.name,
        this.documentToDelete.index
      );
      this.documentToDelete = null;
      this.isDeleteModalOpen = false;
    }
  }

  private executeDocumentDelete(docNameToDelete: string, index: number): void {
    const documents = this.documents;
    if (this.currentDocument?.name === docNameToDelete) {
      this.setCurrentDocumentToNextOrPrevious(documents, index);
    }

    const docToDelete = documents.find((doc) => doc.name === docNameToDelete);
    if (docToDelete) {
      this.store.dispatch(deleteDocument({ document: docToDelete }));
      this.documentDeleted.emit(docToDelete);
    }
  }

  private setCurrentDocumentToNextOrPrevious(
    documents: IDocument[],
    docIndexToDelete: number
  ): void {
    if (documents.length === 1) {
      this.store.dispatch(clearCurrentDocument());
      return;
    }
    const nextDocument =
      docIndexToDelete + 1 === documents.length
        ? documents[docIndexToDelete - 1]
        : documents[docIndexToDelete + 1];
    this.store.dispatch(setCurrentDocument({ document: nextDocument }));
  }
}
