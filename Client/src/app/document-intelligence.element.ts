import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CustomModelLabelPageComponent } from "./containers/custom-model-label-page/custom-model-label-page.component";

@Component({
    selector: "document-intelligence-wrapper",
    standalone: true,
    imports: [CommonModule, CustomModelLabelPageComponent],
    template: `
        <app-custom-model-label-page
            [serverUrl]="serverUrl"
            [allowTable]="allowTable"
            [allowDrawRegion]="allowDrawRegion"
            [allowAddFields]="allowAddFields"
        ></app-custom-model-label-page>
    `,
    styles: [`:host { display: block; width: 100%; height: 100%; }`],
})
export class DocumentIntelligenceElement {
    @Input() serverUrl: string = "";
    @Input() allowTable: boolean = true;
    @Input() allowDrawRegion: boolean = true;
    @Input() allowAddFields: boolean = true;
}
