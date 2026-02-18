import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DialogComponent } from "../dialog/dialog.component";
import { StudioDocumentTable } from "../../models/analyze-result";

export interface TableCell {
    rowIndex: number;
    columnIndex: number;
    rowSpan: number;
    columnSpan: number;
    kind: string;
    content: string[];
}

export interface TableRow {
    cells: TableCell[];
}

@Component({
    selector: "app-table-view",
    standalone: true,
    imports: [CommonModule, DialogComponent],
    template: `
        <app-dialog
            [header]="'Table'"
            [(visible)]="isOpen"
            [dialogStyle]="{ width: 'auto', 'max-width': '85vw', 'max-height': '85vh' }"
            (onHide)="handleTableViewClose.emit()"
        >
            <div class="table-scrollable-container">
                <table class="table-view" *ngIf="tableRows.length > 0">
                    <tbody>
                        <tr *ngFor="let row of tableRows; let rowIndex = index">
                            <ng-container *ngFor="let cell of row.cells">
                                <th
                                    *ngIf="cell.kind === 'columnHeader'"
                                    [attr.colspan]="cell.columnSpan"
                                    [attr.rowspan]="cell.rowSpan"
                                >
                                    <div class="cell-content">
                                        <span *ngFor="let text of cell.content">{{ text }}</span>
                                    </div>
                                </th>
                                <td
                                    *ngIf="cell.kind !== 'columnHeader'"
                                    [attr.colspan]="cell.columnSpan"
                                    [attr.rowspan]="cell.rowSpan"
                                >
                                    <div class="cell-content">
                                        <span *ngFor="let text of cell.content">{{ text }}</span>
                                    </div>
                                </td>
                            </ng-container>
                        </tr>
                    </tbody>
                </table>
            </div>
        </app-dialog>
    `,
    styles: [
        `
            .table-scrollable-container {
                display: flex;
                flex-flow: column;
                flex-grow: 1;
                min-height: 0;
                overflow: auto;
                max-height: 65vh;
            }

            .table-view {
                border-collapse: collapse;
            }

            .table-view td,
            .table-view th {
                border: 2px solid #8d8d8d;
                max-width: 400px;
                padding: 0.5rem 1rem;
            }

            .table-view td:empty::after {
                content: "\\00a0";
            }

            .cell-content {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
            }
        `,
    ],
})
export class TableViewComponent implements OnChanges {
    @Input() tableToView: StudioDocumentTable | null = null;
    @Output() handleTableViewClose = new EventEmitter<void>();

    isOpen = false;
    tableRows: TableRow[] = [];

    ngOnChanges(changes: SimpleChanges): void {
        if (changes["tableToView"]) {
            this.isOpen = this.tableToView !== null;
            this.buildTableBody();
        }
    }

    private buildTableBody(): void {
        if (!this.tableToView) {
            this.tableRows = [];
            return;
        }

        const { rowCount, cells } = this.tableToView;

        // Initialize rows with empty cells arrays
        const rows: TableRow[] = [];
        for (let i = 0; i < rowCount; i++) {
            rows.push({ cells: [] });
        }

        // Place cells into the correct row
        cells.forEach((cell) => {
            const { rowIndex, columnIndex, rowSpan, columnSpan, kind, content } = cell;
            const contentArray = Array.isArray(content) ? content : [content || ""];
            rows[rowIndex].cells.push({
                rowIndex,
                columnIndex,
                rowSpan: rowSpan || 1,
                columnSpan: columnSpan || 1,
                kind: kind || "content",
                content: contentArray,
            });
        });

        // Sort cells within each row by column index
        rows.forEach((row) => {
            row.cells.sort((a, b) => a.columnIndex - b.columnIndex);
        });

        this.tableRows = rows;
    }
}
