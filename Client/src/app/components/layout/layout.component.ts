import { Component, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet } from "@angular/router";
import { Store } from "@ngrx/store";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { FooterComponent } from "../footer/footer.component";
import { LoadingOverlayComponent } from "../loading-overlay/loading-overlay.component";
import { selectLoadingOverlays } from "../../store/portal/portal.selectors";
import { ILoadingOverlay } from "../../store/portal/portal.state";

@Component({
    selector: "app-layout",
    standalone: true,
    imports: [CommonModule, RouterOutlet, FooterComponent, LoadingOverlayComponent],
    template: `
        <div class="main" [attr.aria-busy]="isLoading$ | async" [attr.aria-hidden]="isLoading$ | async">
            <div role="status" class="sr-only">
                <span *ngIf="isLoading$ | async; else loaded">Page is loading</span>
                <ng-template #loaded><span>Page is loaded</span></ng-template>
            </div>
            <div class="page-container">
                <router-outlet></router-outlet>
            </div>
            <app-footer></app-footer>
        </div>
        <app-loading-overlay
            *ngIf="isLoading$ | async"
            [message]="(loadingMessage$ | async) || 'Loading...'"
        ></app-loading-overlay>
    `,
    styleUrls: ["./layout.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {
    loadingOverlays$: Observable<ILoadingOverlay[]>;
    isLoading$: Observable<boolean>;
    loadingMessage$: Observable<string>;

    constructor(private store: Store) {
        this.loadingOverlays$ = this.store.select(selectLoadingOverlays);
        this.isLoading$ = this.loadingOverlays$.pipe(map((overlays) => overlays.length > 0));
        this.loadingMessage$ = this.loadingOverlays$.pipe(
            map((overlays) => {
                if (overlays.length === 0) return "Loading...";
                const sorted = [...overlays].sort((a, b) => b.weight - a.weight);
                return sorted[0].message;
            })
        );
    }
}
