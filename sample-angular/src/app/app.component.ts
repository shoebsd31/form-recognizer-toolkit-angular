import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
    selector: "app-root",
    standalone: true,
    imports: [FormsModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: "./app.component.html",
    styleUrl: "./app.component.scss",
})
export class AppComponent {
    allowTable = true;
    allowDrawRegion = true;
    allowAddFields = true;
}
