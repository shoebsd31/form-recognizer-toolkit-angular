import { Component, Input } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

import { CustomModelLabelPageComponent } from './containers/custom-model-label-page/custom-model-label-page.component';

@Component({
  selector: 'document-intelligence-wrapper',
  standalone: true,
  imports: [CustomModelLabelPageComponent],
  template: `
    <app-custom-model-label-page
      [serverUrl]="serverUrl"
      [allowTable]="allowTable"
      [allowDrawRegion]="allowDrawRegion"
      [allowAddFields]="allowAddFields"
    ></app-custom-model-label-page>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class DocumentIntelligenceElement {
  @Input() serverUrl: string = '';
  @Input() allowTable: boolean = true;
  @Input() allowDrawRegion: boolean = true;
  @Input() allowAddFields: boolean = true;

  /** URL of pdf.worker.min.mjs. Default: the file shipped next to the bundle. Set it when the worker is served from elsewhere. */
  @Input() set workerSrc(value: string | null | undefined) {
    if (value) pdfjsLib.GlobalWorkerOptions.workerSrc = value;
  }
}
