import { Component, Input, Inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';

import { Store } from '@ngrx/store';
import { Subject, combineLatest } from 'rxjs';
import {
  takeUntil,
  distinctUntilChanged,
  pairwise,
  startWith,
  filter,
} from 'rxjs/operators';
import { AngularSplitModule } from 'angular-split';

import { DocumentGalleryComponent } from '../document-gallery/document-gallery.component';
import { LabelCanvasComponent } from '../label-canvas/label-canvas.component';
import { LabelPaneComponent } from '../label-pane/label-pane.component';
import { MessageModalComponent } from '../../components/message-modal/message-modal.component';

import {
  StorageProviderService,
  IStorageProviderError,
} from '../../providers/storage-provider.service';
import { constants } from '../../consts/constants';
import { SplitPaneSizes } from '../../models';
import {
  IDocument,
  IRawDocument,
  DocumentStatus,
} from '../../store/documents/documents.types';
import { isSupportedFile, getDocumentType } from '../../utils/document-loader';
import { analyzerToFields } from '../../utils/analyzer-fields';
import { isLabelFieldWithCorrectFormat } from '../../utils/custom-model/schema-validation/fields-validator';
import {
  parseLabelsFile,
  getConfidenceFromAnalyzeResult,
  getPageDimsFromAnalyzeResult,
} from '../../utils/cuf-labels';
import { CufPageDim } from '../../models/cuf-labels';
import { TrainingFlagService } from '../../services/training-flag.service';
import { LABELING_CONFIG, LabelingConfig } from '../../models/labeling-config';

import {
  addDocuments,
  deleteDocument,
  setDocumentAnalyzingStatus,
  setDocumentLabelingStatus,
} from '../../store/documents/documents.actions';
import {
  setFields,
  setDefinitions,
  setLabelsByName,
  clearLabelError,
  deleteLabelByName,
} from '../../store/custom-model/custom-model.actions';
import { setDocumentPrediction } from '../../store/predictions/predictions.actions';
import {
  addLoadingOverlay,
  removeLoadingOverlayByName,
} from '../../store/portal/portal.actions';

import {
  selectDocuments,
  selectCurrentDocument,
} from '../../store/documents/documents.selectors';
import {
  selectLabels,
  selectLabelError,
} from '../../store/custom-model/custom-model.selectors';
import { selectPredictions } from '../../store/predictions/predictions.selectors';

const LOADING_OVERLAY_NAME = 'customModelLabelPage';

@Component({
  selector: 'app-custom-model-label-page',
  standalone: true,
  imports: [
    AngularSplitModule,
    DocumentGalleryComponent,
    LabelCanvasComponent,
    LabelPaneComponent,
    MessageModalComponent,
  ],
  template: `
    <div class="custom-doc-label-page">
      <div class="label-page-header">
        <h2 class="page-title" tabindex="0" aria-label="Document labels">
          Document labels
        </h2>
        @if (currentDocument) {
        <button
          type="button"
          class="training-toggle"
          [class.on]="markedForTraining"
          role="switch"
          [attr.aria-checked]="markedForTraining"
          [disabled]="savingTrainingFlag"
          title="Mark this document as an example for training the classifier. The flag is saved with the document."
          (click)="toggleTraining(!markedForTraining)"
        >
          <span class="training-label">Mark for training</span>
          <span class="training-track" aria-hidden="true"><span class="training-thumb"></span></span>
          <span class="training-state">{{
            savingTrainingFlag ? 'Saving…' : markedForTraining ? 'On' : 'Off'
          }}</span>
        </button>
        }
      </div>
      <div class="label-page-main">
        <div class="label-page-gallery">
          <app-document-gallery
            [hideAddButton]="false"
            [shouldConfirmDeleteDocument]="true"
            (documentDeleted)="deleteDocumentInStorage($event)"
          ></app-document-gallery>
        </div>
        <as-split
          class="split-container"
          direction="horizontal"
          [gutterSize]="8"
          (dragEnd)="handleSplitPaneSizesChange($event)"
        >
          <as-split-area [size]="currentSplitSize[0]">
            <div class="label-page-canvas">
              <app-label-canvas
                [allowDrawRegion]="allowDrawRegion"
              ></app-label-canvas>
            </div>
          </as-split-area>
          <as-split-area
            [size]="currentSplitSize[1]"
            [minSize]="15"
            [maxSize]="50"
          >
            <div class="label-page-pane">
              <app-label-pane
                [isTablePaneOpen]="isTablePaneOpen"
                [allowAddFields]="allowAddFields"
                [allowTable]="allowTable"
                (isTablePaneOpenChange)="setIsTablePaneOpen($event)"
              ></app-label-pane>
            </div>
          </as-split-area>
        </as-split>
      </div>

      <!-- Label error modal -->
      @if (labelError !== null) {
      <app-message-modal
        [isOpen]="true"
        [title]="labelError.name"
        [rejectButtonText]="'Close'"
        (onClose)="handleClearLabelError()"
      >
        <p>{{ labelError.message }}</p>
      </app-message-modal>
      }

      <!-- Invalid fields format modal -->
      @if (isInvalidFieldsFormatModalOpen) {
      <app-message-modal
        [isOpen]="isInvalidFieldsFormatModalOpen"
        [title]="'Incorrect fields format'"
        [actionButtonText]="'Delete fields.json file'"
        (onClose)="handleCloseIncorrectLabelFieldsFormatModal()"
        (onActionButtonClick)="handleDeleteLabelFieldsJsonFile()"
      >
        <p>
          The fields.json file of this project does not align with the expected
          schema. Please correct the file and re-enter the project, or delete
          fields.json file and create fields again.
        </p>
      </app-message-modal>
      }

      <!-- Storage error modal -->
      @if (errorMessage) {
      <app-message-modal
        [isOpen]="true"
        [title]="errorMessage.code"
        [rejectButtonText]="'Close'"
        (onClose)="handleCloseStorageErrorModal()"
      >
        <p>{{ errorMessage.message }}</p>
      </app-message-modal>
      }

      <!-- Empty folder modal -->
      @if (showEmptyFolderMessage) {
      <app-message-modal
        [isOpen]="true"
        [title]="'No document found in data folder'"
        [rejectButtonText]="'Close'"
        (onClose)="showEmptyFolderMessage = false"
      >
        <p>
          Please provide documents and their corresponding OCR file in
          <b>Server/data</b> to start labeling.
        </p>
      </app-message-modal>
      }
    </div>
  `,
  styleUrls: ['./custom-model-label-page.component.scss'],
})
export class CustomModelLabelPageComponent implements OnInit, OnDestroy {
  // Configurable inputs
  @Input() serverUrl?: string;
  @Input() allowTable: boolean = true;
  @Input() allowDrawRegion: boolean = true;
  @Input() allowAddFields: boolean = true;

  // Local state
  isLoadingFields: boolean = true;
  isLoadingLabels: boolean = true;
  isInvalidFieldsFormatModalOpen: boolean = false;
  isTablePaneOpen: boolean = false;
  errorMessage: IStorageProviderError | undefined = undefined;
  splitPaneSizes: SplitPaneSizes = constants.defaultSplitPaneSizes;
  showEmptyFolderMessage: boolean = false;
  markedForTraining: boolean = false;
  savingTrainingFlag: boolean = false;

  // Store state
  labelError: { name: string; message: string } | null = null;
  currentDocument: IDocument | null = null;
  labels: Record<string, any[]> = {};
  predictions: Record<string, any> = {};

  private mounted: boolean = true;
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private storageProvider: StorageProviderService,
    @Inject(LABELING_CONFIG) private config: LabelingConfig,
    private trainingFlag: TrainingFlagService,
    private cdr: ChangeDetectorRef
  ) {}

  get currentSplitSize(): number[] {
    return this.isTablePaneOpen
      ? this.splitPaneSizes.labelTableSplitPaneSize
      : this.splitPaneSizes.labelSplitPaneSize;
  }

  ngOnInit(): void {
    if (this.serverUrl) this.storageProvider.setServerUrl(this.serverUrl);
    this.subscribeToStore();
    this.initLabelPage();
  }

  ngOnDestroy(): void {
    this.mounted = false;
    this.destroy$.next();
    this.destroy$.complete();
    this.store.dispatch(
      removeLoadingOverlayByName({ name: LOADING_OVERLAY_NAME })
    );
  }

  // -- Store subscriptions --

  private subscribeToStore(): void {
    // Subscribe to label error
    this.store
      .select(selectLabelError)
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        this.labelError = error;
      });

    // Subscribe to labels
    this.store
      .select(selectLabels)
      .pipe(takeUntil(this.destroy$))
      .subscribe((labels) => {
        this.labels = labels;
      });

    // Subscribe to predictions
    this.store
      .select(selectPredictions)
      .pipe(takeUntil(this.destroy$))
      .subscribe((predictions) => {
        this.predictions = predictions;
      });

    // Subscribe to current document changes for OCR and labels fetching
    this.store
      .select(selectCurrentDocument)
      .pipe(
        takeUntil(this.destroy$),
        startWith(null as IDocument | null),
        pairwise()
      )
      .subscribe(([prev, current]) => {
        this.currentDocument = current;

        // Fetch OCR when document changes and no predictions exist
        if (
          current &&
          prev?.name !== current.name &&
          !this.predictions[current.name]
        ) {
          if (current.states.analyzingStatus !== DocumentStatus.Analyzing) {
            this.getAndSetOcr();
          }
        }

        // Fetch labels when document changes and no labels exist
        if (
          current &&
          prev?.name !== current.name &&
          !this.labels[current.name]
        ) {
          this.getAndSetLabels();
        }
      });

    // Track labeling status changes based on label count
    combineLatest([
      this.store.select(selectCurrentDocument),
      this.store.select(selectLabels),
    ])
      .pipe(
        takeUntil(this.destroy$),
        startWith([null, {}] as [IDocument | null, Record<string, any[]>]),
        pairwise()
      )
      .subscribe(([prev, current]) => {
        const [prevDoc, prevLabels] = prev as [
          IDocument | null,
          Record<string, any[]>
        ];
        const [currDoc, currLabels] = current as [
          IDocument | null,
          Record<string, any[]>
        ];

        if (!currDoc) return;

        const prevLength = (prevLabels as any)?.[currDoc.name]?.length ?? 0;
        const currLength = currLabels[currDoc.name]?.length ?? 0;

        if (prevLength === 0 && currLength !== 0) {
          this.store.dispatch(
            setDocumentLabelingStatus({
              name: currDoc.name,
              status: DocumentStatus.Labeled,
            })
          );
        }

        if (prevLength !== 0 && currLength === 0) {
          this.store.dispatch(
            setDocumentLabelingStatus({ name: currDoc.name, status: undefined })
          );
        }
      });

    // Remove loading overlay when first document is loaded with labels
    combineLatest([this.store.select(selectCurrentDocument)])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([currentDocument]) => {
        if (currentDocument && !this.isLoadingLabels) {
          this.store.dispatch(
            removeLoadingOverlayByName({ name: LOADING_OVERLAY_NAME })
          );
        }
      });
  }

  // -- Initialization --

  private async initLabelPage(): Promise<void> {
    this.store.dispatch(
      addLoadingOverlay({
        name: LOADING_OVERLAY_NAME,
        message: 'Loading documents...',
      })
    );
    await this.getAndSetDocuments();
    await this.getAndSetFields();
    this.store.dispatch(
      removeLoadingOverlayByName({ name: LOADING_OVERLAY_NAME })
    );
  }

  private composeFileUrl(filePath: string): string {
    const baseUrl = this.serverUrl ?? this.config.serverSiteUrl;
    return `${baseUrl}/files/${filePath}`;
  }

  private makeRawDocument(filePath: string): IRawDocument {
    const path = encodeURIComponent(filePath);
    return {
      name: filePath.split('/').pop()!,
      type: getDocumentType(filePath),
      url: this.composeFileUrl(path),
    };
  }

  // -- Data fetching --

  private async getAndSetDocuments(): Promise<void> {
    try {
      const filePaths = await this.storageProvider.listFilesInFolder();
      const documents: IRawDocument[] = filePaths
        .filter(isSupportedFile)
        .map((fp) => this.makeRawDocument(fp));

      this.showEmptyFolderMessage = documents.length === 0;

      if (!this.showEmptyFolderMessage) {
        const chunkSize = 3;
        for (let i = 0, j = documents.length; i < j; i += chunkSize) {
          const documentChunk = documents.slice(i, i + chunkSize);
          if (this.mounted) {
            this.store.dispatch(addDocuments({ documents: documentChunk }));
            // Allow some time for document processing
            await new Promise((resolve) => setTimeout(resolve, 50));

            documentChunk.forEach((document) => {
              const { name } = document;
              const ocrFileName = `${name}${constants.ocrFileExtension}`;
              const labelFileName = `${name}${constants.labelFileExtension}`;

              if (filePaths.includes(ocrFileName)) {
                this.store.dispatch(
                  setDocumentAnalyzingStatus({
                    name,
                    status: DocumentStatus.Analyzed,
                  })
                );
              }
              if (filePaths.includes(labelFileName)) {
                this.store.dispatch(
                  setDocumentLabelingStatus({
                    name,
                    status: DocumentStatus.Labeled,
                  })
                );
              }
            });
          }
        }
      }
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    }
  }

  private async getAndSetFields(): Promise<void> {
    this.isLoadingFields = true;
    try {
      // The CU analyzer definition is the source of truth for the field list;
      // fall back to fields.json only when no analyzer.json is available.
      const analyzerFields = await this.readAnalyzerFields();
      if (analyzerFields) {
        this.store.dispatch(
          setDefinitions({ definitions: analyzerFields.definitions })
        );
        this.store.dispatch(setFields({ fields: analyzerFields.fields }));
        return;
      }

      const rawFields = await this.storageProvider.readText(
        constants.fieldsFile,
        true
      );

      if (rawFields) {
        const parsedFields = JSON.parse(rawFields);
        if (!isLabelFieldWithCorrectFormat(parsedFields)) {
          this.isInvalidFieldsFormatModalOpen = true;
        } else {
          const { fields, definitions } = parsedFields;
          this.store.dispatch(
            setDefinitions({ definitions: definitions || {} })
          );
          this.store.dispatch(setFields({ fields }));
        }
      }
    } catch (err: any) {
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.isLoadingFields = false;
    }
  }

  private async readAnalyzerFields() {
    try {
      const raw = await this.storageProvider.readText(
        constants.analyzerFile,
        true
      );
      return raw ? analyzerToFields(JSON.parse(raw)) : undefined;
    } catch {
      return undefined; // missing/invalid analyzer.json -> use fields.json
    }
  }

  async toggleTraining(checked: boolean): Promise<void> {
    if (!this.currentDocument) return;
    this.markedForTraining = checked;
    this.savingTrainingFlag = true;
    this.cdr.markForCheck();
    try {
      await this.trainingFlag.set(this.currentDocument.name, checked);
    } catch (err) {
      this.markedForTraining = !checked;
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.savingTrainingFlag = false;
      // the app can run without zone.js: a change made after an await is only drawn when the view is marked
      this.cdr.markForCheck();
    }
  }

  private async getAndSetLabels(): Promise<void> {
    this.isLoadingLabels = true;
    try {
      if (!this.currentDocument) return;
      this.markedForTraining = await this.trainingFlag.load(
        this.currentDocument.name
      );
      this.cdr.markForCheck();
      const labels = await this.storageProvider.readText(
        `${this.currentDocument.name}${constants.labelFileExtension}`,
        true
      );
      if (labels) {
        const analyzeResult = await this.getAnalyzeResultForDocument(
          this.currentDocument.name
        );
        const pageDims = getPageDimsFromAnalyzeResult(analyzeResult);
        this.store.dispatch(
          setLabelsByName({
            name: this.currentDocument.name,
            labels: parseLabelsFile(
              labels,
              pageDims,
              getConfidenceFromAnalyzeResult(analyzeResult)
            ),
          })
        );
      } else {
        this.store.dispatch(
          setLabelsByName({ name: this.currentDocument.name, labels: [] })
        );
      }
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.isLoadingLabels = false;
    }
  }

  /**
   * Per-page pixel dimensions for a document, needed to convert CUF `source`
   * (pixel polygons) into the internal normalized bounding boxes. Uses the
   * already-loaded prediction, falling back to reading the Content Understanding
   * result (*.result.json) and then the legacy OCR file (*.ocr.json).
   */
  private async getAnalyzeResultForDocument(name: string): Promise<any> {
    let analyzeResult =
      this.predictions?.[name]?.analyzeResponse?.analyzeResult;
    if (!analyzeResult) {
      // Try the CU result first (its pages carry the dimensions), then the
      // legacy OCR layout. getPageDimsFromAnalyzeResult handles both shapes.
      for (const ext of [
        constants.resultFileExtension,
        constants.ocrFileExtension,
      ]) {
        try {
          const raw = await this.storageProvider.readText(
            `${name}${ext}`,
            true
          );
          if (raw) {
            const parsed = JSON.parse(raw);
            analyzeResult = parsed.result ?? parsed.analyzeResult ?? parsed;
            break;
          }
        } catch {
          /* try next source */
        }
      }
    }
    return analyzeResult;
  }

  private async getAndSetOcr(): Promise<void> {
    if (!this.currentDocument) return;

    const { name } = this.currentDocument;
    const resultFilePath = `${name}${constants.resultFileExtension}`;
    const ocrFilePath = `${name}${constants.ocrFileExtension}`;

    try {
      // Prefer the Content Understanding result (*.result.json): its pages carry
      // the OCR words used for the yellow word overlay. Fall back to the legacy
      // layout (*.ocr.json) for documents that don't have a CU result yet.
      if (await this.storageProvider.isFileExists(resultFilePath, true)) {
        const rawResponse = await this.storageProvider.readText(
          resultFilePath,
          true
        );
        if (rawResponse) {
          const parsed = JSON.parse(rawResponse);
          // The CU result nests the analyze output under `result`; the OCR layer
          // reads it via `analyzeResponse.analyzeResult`.
          const analyzeResult = parsed.result ?? parsed;
          this.store.dispatch(
            setDocumentPrediction({
              name,
              analyzeResponse: { analyzeResult } as any,
            })
          );
        }
      } else if (await this.storageProvider.isFileExists(ocrFilePath, true)) {
        const rawResponse = await this.storageProvider.readText(
          ocrFilePath,
          true
        );
        if (rawResponse) {
          const layoutResponse = JSON.parse(rawResponse);
          this.store.dispatch(
            setDocumentPrediction({ name, analyzeResponse: layoutResponse })
          );
        }
      }
      this.store.dispatch(
        setDocumentAnalyzingStatus({ name, status: DocumentStatus.Analyzed })
      );
    } catch (err: any) {
      this.errorMessage = err as IStorageProviderError;
    }
  }

  // -- Event handlers --

  handleSplitPaneSizesChange(event: any): void {
    const sizes = event.sizes as number[];
    if (this.isTablePaneOpen) {
      this.splitPaneSizes = {
        ...this.splitPaneSizes,
        labelTableSplitPaneSize: sizes,
      };
    } else {
      this.splitPaneSizes = {
        ...this.splitPaneSizes,
        labelSplitPaneSize: sizes,
      };
    }
  }

  async deleteDocumentInStorage(doc: IDocument): Promise<void> {
    const { name } = doc;
    const ocrFileName = `${name}${constants.ocrFileExtension}`;
    const labelFileName = `${name}${constants.labelFileExtension}`;

    this.store.dispatch(deleteLabelByName({ name: doc.name }));
    try {
      await this.storageProvider.deleteFile(name);
      await this.storageProvider.deleteFile(ocrFileName, true);
      await this.storageProvider.deleteFile(labelFileName, true);
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    }
  }

  async handleDeleteLabelFieldsJsonFile(): Promise<void> {
    try {
      await this.storageProvider.deleteFile(constants.fieldsFile, true);
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.isInvalidFieldsFormatModalOpen = false;
    }
  }

  handleCloseIncorrectLabelFieldsFormatModal(): void {
    this.isInvalidFieldsFormatModalOpen = false;
  }

  handleClearLabelError(): void {
    this.store.dispatch(clearLabelError());
  }

  handleCloseStorageErrorModal(): void {
    this.errorMessage = undefined;
  }

  setIsTablePaneOpen(state: boolean): void {
    this.isTablePaneOpen = state;
  }
}
