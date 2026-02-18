import { Component, Input, Inject, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngrx/store";
import { Subject, combineLatest } from "rxjs";
import { takeUntil, distinctUntilChanged, pairwise, startWith, filter } from "rxjs/operators";
import { AngularSplitModule } from "angular-split";

import { DocumentGalleryComponent } from "../document-gallery/document-gallery.component";
import { LabelCanvasComponent } from "../label-canvas/label-canvas.component";
import { LabelPaneComponent } from "../label-pane/label-pane.component";
import { MessageModalComponent } from "../../components/message-modal/message-modal.component";

import { StorageProviderService, IStorageProviderError } from "../../providers/storage-provider.service";
import { constants } from "../../consts/constants";
import { SplitPaneSizes } from "../../models";
import { IDocument, IRawDocument, DocumentStatus } from "../../store/documents/documents.types";
import { isSupportedFile, getDocumentType } from "../../utils/document-loader";
import { isLabelFieldWithCorrectFormat } from "../../utils/custom-model/schema-validation/fields-validator";
import { LABELING_CONFIG, LabelingConfig } from "../../models/labeling-config";

import {
    addDocuments,
    deleteDocument,
    setDocumentAnalyzingStatus,
    setDocumentLabelingStatus,
} from "../../store/documents/documents.actions";
import {
    setFields,
    setDefinitions,
    setLabelsByName,
    clearLabelError,
    deleteLabelByName,
} from "../../store/custom-model/custom-model.actions";
import { setDocumentPrediction } from "../../store/predictions/predictions.actions";
import { addLoadingOverlay, removeLoadingOverlayByName } from "../../store/portal/portal.actions";

import { selectDocuments, selectCurrentDocument } from "../../store/documents/documents.selectors";
import { selectLabels, selectLabelError } from "../../store/custom-model/custom-model.selectors";
import { selectPredictions } from "../../store/predictions/predictions.selectors";

const LOADING_OVERLAY_NAME = "customModelLabelPage";

@Component({
    selector: "app-custom-model-label-page",
    standalone: true,
    imports: [
        CommonModule,
        AngularSplitModule,
        DocumentGalleryComponent,
        LabelCanvasComponent,
        LabelPaneComponent,
        MessageModalComponent,
    ],
    template: `
        <div class="custom-doc-label-page">
            <div class="label-page-header">
                <h2 class="page-title" tabindex="0" aria-label="Label Page">Label Page</h2>
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
                            <app-label-canvas [allowDrawRegion]="allowDrawRegion"></app-label-canvas>
                        </div>
                    </as-split-area>
                    <as-split-area [size]="currentSplitSize[1]" [minSize]="15" [maxSize]="50">
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
            <app-message-modal
                *ngIf="labelError !== null"
                [isOpen]="true"
                [title]="labelError.name"
                [rejectButtonText]="'Close'"
                (onClose)="handleClearLabelError()"
            >
                <p>{{ labelError.message }}</p>
            </app-message-modal>

            <!-- Invalid fields format modal -->
            <app-message-modal
                *ngIf="isInvalidFieldsFormatModalOpen"
                [isOpen]="isInvalidFieldsFormatModalOpen"
                [title]="'Incorrect fields format'"
                [actionButtonText]="'Delete fields.json file'"
                (onClose)="handleCloseIncorrectLabelFieldsFormatModal()"
                (onActionButtonClick)="handleDeleteLabelFieldsJsonFile()"
            >
                <p>
                    The fields.json file of this project does not align with the expected schema.
                    Please correct the file and re-enter the project, or delete fields.json file
                    and create fields again.
                </p>
            </app-message-modal>

            <!-- Storage error modal -->
            <app-message-modal
                *ngIf="errorMessage"
                [isOpen]="true"
                [title]="errorMessage.code"
                [rejectButtonText]="'Close'"
                (onClose)="handleCloseStorageErrorModal()"
            >
                <p>{{ errorMessage.message }}</p>
            </app-message-modal>

            <!-- Empty folder modal -->
            <app-message-modal
                *ngIf="showEmptyFolderMessage"
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
        </div>
    `,
    styleUrls: ["./custom-model-label-page.component.scss"],
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
    ) {}

    get currentSplitSize(): number[] {
        return this.isTablePaneOpen
            ? this.splitPaneSizes.labelTableSplitPaneSize
            : this.splitPaneSizes.labelSplitPaneSize;
    }

    ngOnInit(): void {
        this.subscribeToStore();
        this.initLabelPage();
    }

    ngOnDestroy(): void {
        this.mounted = false;
        this.destroy$.next();
        this.destroy$.complete();
        this.store.dispatch(removeLoadingOverlayByName({ name: LOADING_OVERLAY_NAME }));
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
                if (current && prev?.name !== current.name && !this.predictions[current.name]) {
                    if (current.states.analyzingStatus !== DocumentStatus.Analyzing) {
                        this.getAndSetOcr();
                    }
                }

                // Fetch labels when document changes and no labels exist
                if (current && prev?.name !== current.name && !this.labels[current.name]) {
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
                const [prevDoc, prevLabels] = prev as [IDocument | null, Record<string, any[]>];
                const [currDoc, currLabels] = current as [IDocument | null, Record<string, any[]>];

                if (!currDoc) return;

                const prevLength = (prevLabels as any)?.[currDoc.name]?.length ?? 0;
                const currLength = currLabels[currDoc.name]?.length ?? 0;

                if (prevLength === 0 && currLength !== 0) {
                    this.store.dispatch(
                        setDocumentLabelingStatus({ name: currDoc.name, status: DocumentStatus.Labeled })
                    );
                }

                if (prevLength !== 0 && currLength === 0) {
                    this.store.dispatch(
                        setDocumentLabelingStatus({ name: currDoc.name, status: undefined })
                    );
                }
            });

        // Remove loading overlay when first document is loaded with labels
        combineLatest([
            this.store.select(selectCurrentDocument),
        ])
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
                message: "Loading documents...",
            })
        );
        await this.getAndSetDocuments();
        await this.getAndSetFields();
        this.store.dispatch(removeLoadingOverlayByName({ name: LOADING_OVERLAY_NAME }));
    }

    private composeFileUrl(filePath: string): string {
        const baseUrl = this.serverUrl ?? this.config.serverSiteUrl;
        return `${baseUrl}/files/${filePath}`;
    }

    private makeRawDocument(filePath: string): IRawDocument {
        const path = encodeURIComponent(filePath);
        return {
            name: filePath.split("/").pop()!,
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
                                    setDocumentAnalyzingStatus({ name, status: DocumentStatus.Analyzed })
                                );
                            }
                            if (filePaths.includes(labelFileName)) {
                                this.store.dispatch(
                                    setDocumentLabelingStatus({ name, status: DocumentStatus.Labeled })
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
            const rawFields = await this.storageProvider.readText(constants.fieldsFile, true);

            if (rawFields) {
                const parsedFields = JSON.parse(rawFields);
                if (!isLabelFieldWithCorrectFormat(parsedFields)) {
                    this.isInvalidFieldsFormatModalOpen = true;
                } else {
                    const { fields, definitions } = parsedFields;
                    this.store.dispatch(setDefinitions({ definitions: definitions || {} }));
                    this.store.dispatch(setFields({ fields }));
                }
            }
        } catch (err: any) {
            this.errorMessage = err as IStorageProviderError;
        } finally {
            this.isLoadingFields = false;
        }
    }

    private async getAndSetLabels(): Promise<void> {
        this.isLoadingLabels = true;
        try {
            if (!this.currentDocument) return;
            const labels = await this.storageProvider.readText(
                `${this.currentDocument.name}${constants.labelFileExtension}`,
                true
            );
            if (labels) {
                this.store.dispatch(
                    setLabelsByName({
                        name: this.currentDocument.name,
                        labels: JSON.parse(labels).labels,
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

    private async getAndSetOcr(): Promise<void> {
        if (!this.currentDocument) return;

        const { name } = this.currentDocument;
        const ocrFilePath = `${name}${constants.ocrFileExtension}`;

        try {
            if (await this.storageProvider.isFileExists(ocrFilePath, true)) {
                const rawResponse = await this.storageProvider.readText(ocrFilePath, true);
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
