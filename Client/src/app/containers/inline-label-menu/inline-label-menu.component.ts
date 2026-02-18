import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Store } from "@ngrx/store";
import { Observable, Subject, combineLatest } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { Field, FieldType, FieldFormat, PrimitiveField } from "../../models/custom-models";
import { selectFields, selectColorForFields, selectHideInlineLabelMenu } from "../../store/custom-model/custom-model.selectors";
import { addField, assignLabel } from "../../store/custom-model/custom-model.actions";
import { getColorByFieldKey, encodeLabelString } from "../../utils/custom-model";

interface MenuItem {
    iconType: "color" | "icon";
    iconColor?: string;
    iconClass?: string;
    text: string;
    disabled?: boolean;
    onClick: () => void;
}

export const INLINE_LABEL_MENU_HEIGHT = 180;

@Component({
    selector: "app-inline-label-menu",
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div
            *ngIf="showPopup && !hideInlineLabelMenu"
            class="inline-label-menu-container"
            [style.top.px]="positionTop"
            [style.left.px]="positionLeft"
        >
            <div class="inline-label-menu-input">
                <input
                    type="text"
                    [value]="searchText"
                    (input)="onSearchTextChange($event)"
                    placeholder="Search existing or create new"
                    autocomplete="off"
                    #searchInput
                />
            </div>
            <div class="inline-label-menu-list">
                <button
                    *ngFor="let item of items"
                    class="inline-label-menu-item"
                    [disabled]="item.disabled"
                    [attr.aria-label]="item.text"
                    (click)="item.onClick()"
                >
                    <span
                        *ngIf="item.iconType === 'color'"
                        class="field-color-icon"
                        [style.background-color]="item.iconColor"
                    ></span>
                    <i
                        *ngIf="item.iconType === 'icon'"
                        class="create-field-icon"
                        [ngClass]="item.iconClass"
                    ></i>
                    <span class="field-name">{{ item.text }}</span>
                </button>
            </div>
        </div>
    `,
    styleUrls: ["./inline-label-menu.component.scss"],
})
export class InlineLabelMenuComponent implements OnInit, OnDestroy, OnChanges {
    @Input() showPopup: boolean = false;
    @Input() positionTop: number = 0;
    @Input() positionLeft: number = 0;
    @Input() enabledTypes: FieldType[] = [FieldType.String, FieldType.Number, FieldType.Date, FieldType.Time, FieldType.Integer];

    items: MenuItem[] = [];
    searchText: string = "";
    hideInlineLabelMenu: boolean = false;

    private fields: Field[] = [];
    private colorForFields: Record<string, string>[] = [];
    private destroy$ = new Subject<void>();

    constructor(private store: Store) {}

    ngOnInit(): void {
        this.store
            .select(selectHideInlineLabelMenu)
            .pipe(takeUntil(this.destroy$))
            .subscribe((hide) => {
                this.hideInlineLabelMenu = hide;
            });

        combineLatest([
            this.store.select(selectFields),
            this.store.select(selectColorForFields),
        ])
            .pipe(takeUntil(this.destroy$))
            .subscribe(([fields, colorForFields]) => {
                this.fields = fields;
                this.colorForFields = colorForFields;
                this.prepareItems();
            });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes["enabledTypes"]) {
            this.prepareItems();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onSearchTextChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.searchText = input.value;
        this.prepareItems();
    }

    private prepareItems(): void {
        const lowerSearchText = this.searchText.toLocaleLowerCase();

        const fieldItems: MenuItem[] = this.fields
            .filter(
                (f) => f.fieldType !== FieldType.Array && f.fieldType !== FieldType.Object
            )
            .filter((f) => f.fieldKey.toLocaleLowerCase().includes(lowerSearchText))
            .filter((f) => this.enabledTypes.includes(f.fieldType))
            .map((f) => ({
                iconType: "color" as const,
                iconColor: getColorByFieldKey(this.colorForFields, f.fieldKey),
                text: f.fieldKey,
                onClick: () => this.handleFieldClick(f.fieldKey),
            }));

        this.items = fieldItems.length > 0 ? fieldItems : this.makeCreateFieldItems();
    }

    private makeCreateFieldItems(): MenuItem[] {
        return [
            {
                text: "Field",
                iconType: "icon",
                iconClass: "pi pi-list",
                onClick: () => this.handleCreateFieldClick(this.searchText, FieldType.String),
            },
            {
                text: "Selection mark",
                iconType: "icon",
                iconClass: "pi pi-check-square",
                onClick: () => this.handleCreateFieldClick(this.searchText, FieldType.SelectionMark),
            },
            {
                text: "Signature",
                iconType: "icon",
                iconClass: "pi pi-pencil",
                onClick: () => this.handleCreateFieldClick(this.searchText, FieldType.Signature),
            },
        ];
    }

    private handleFieldClick(fieldKey: string): void {
        this.store.dispatch(assignLabel({ labelName: encodeLabelString(fieldKey) }));
        this.searchText = "";
        this.prepareItems();
    }

    private handleCreateFieldClick(fieldKey: string, fieldType: FieldType): void {
        if (!fieldKey) {
            return;
        }
        const field: PrimitiveField = {
            fieldKey,
            fieldType,
            fieldFormat: FieldFormat.NotSpecified,
        };
        this.store.dispatch(addField({ field }));
        // Dispatch assignLabel after a small delay to allow the field to be added
        setTimeout(() => {
            this.store.dispatch(assignLabel({ labelName: encodeLabelString(fieldKey) }));
            this.searchText = "";
            this.prepareItems();
        }, 100);
    }
}
