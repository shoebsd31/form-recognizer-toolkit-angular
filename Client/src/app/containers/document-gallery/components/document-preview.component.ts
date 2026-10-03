import { Component, Input, Output, EventEmitter } from '@angular/core';

import {
  IDocument,
  IDocumentStates,
  DocumentStatus,
} from '../../../store/documents/documents.types';

@Component({
  selector: 'app-document-preview',
  standalone: true,
  imports: [],
  template: `
    <div
      class="document-card"
      [class.selected]="isSelected"
      [title]="document.name"
      [attr.aria-label]="
        document.name + ' Document Status: ' + getAnalyzeStatusString()
      "
      tabindex="0"
      (click)="onClick.emit(document.name)"
      (mouseenter)="isHovered = true"
      (mouseleave)="isHovered = false"
    >
      @if (document.thumbnail) {
      <img
        class="document-card-image"
        [src]="document.thumbnail"
        [alt]="document.name"
      />
      } @else {
      <div class="document-card-image-placeholder">
        <i class="pi pi-file"></i>
      </div>
      }

      <div class="document-card-details">
        <span class="document-card-title" [title]="document.name">{{
          document.name
        }}</span>
      </div>

      @if (isHovered) {
      <button
        class="documentcard-delete-icon"
        title="Delete"
        (click)="onDelete($event)"
      >
        <i class="pi pi-trash"></i>
      </button>
      } @if (document.states.analyzingStatus === DocumentStatus.Analyzing) {
      <div class="documentcard-overlay">
        <span class="analyze-spinner">Analyzing...</span>
      </div>
      }

      <div class="documentcard-badge">
        @if (document.states.labelingStatus === DocumentStatus.Labeled) {
        <i class="pi pi-circle-fill badge-labeled" title="Labeled"></i>
        } @if ( document.states.labelingStatus !== DocumentStatus.Labeled &&
        document.states.analyzingStatus === DocumentStatus.Analyzed ) {
        <i class="pi pi-circle-fill badge-analyzed" title="Analyzed"></i>
        }
      </div>
    </div>
  `,
  styleUrls: ['./document-preview.component.scss'],
})
export class DocumentPreviewComponent {
  @Input() document!: IDocument;
  @Input() isSelected: boolean = false;

  @Output() onClick = new EventEmitter<string>();
  @Output() onDeleteClick = new EventEmitter<string>();

  isHovered = false;

  readonly DocumentStatus = DocumentStatus;

  getAnalyzeStatusString(): string {
    const states = this.document.states;
    switch (states.analyzingStatus) {
      case DocumentStatus.Analyzed:
        return 'Analyzed';
      case DocumentStatus.Analyzing:
        return 'Analyzing...';
      case DocumentStatus.AnalyzeFailed:
        return 'Analyze failed';
      default:
        return 'Loaded';
    }
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.onDeleteClick.emit(this.document.name);
  }
}
