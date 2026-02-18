import { Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { Store } from "@ngrx/store";
import { from, of } from "rxjs";
import { switchMap, map, catchError, withLatestFrom } from "rxjs/operators";

import { CustomModelAssetService } from "../../services/asset-service/custom-model-asset.service";
import * as CustomModelActions from "./custom-model.actions";
import { selectDefinitions, selectFields, selectLabels, selectLabelValueCandidates, selectOrders } from "./custom-model.selectors";
import { selectCurrentDocument, selectDocuments } from "../documents/documents.selectors";
import { FieldLocation } from "./custom-model.state";
import {
    FieldType,
    FieldFormat,
    HeaderType,
    TableType,
    VisualizationHint,
    LabelValue,
    LabelType,
} from "../../models/custom-models";
import {
    getAllDocumentLabels,
    getFieldKeyFromLabel,
    getTableFieldKeyFromLabel,
    encodeLabelString,
    uniqueByKeepFirst,
    makeLabelValue,
    compareOrder,
    decodeLabelString,
    validateAssignment,
    makeError,
} from "../../utils/custom-model";
import { FeatureCategory } from "../../components/image-map/contracts";

@Injectable()
export class CustomModelEffects {
    // 1. addField
    addField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.addField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectDefinitions)
            ),
            switchMap(([{ field }, fields, definitions]) => {
                const updatedFields = fields.concat(field);
                return from(this.assetService.updateFields(updatedFields, definitions)).pipe(
                    map(() => CustomModelActions.addFieldSuccess({ field })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 2. updateFieldsOrder
    updateFieldsOrder$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.updateFieldsOrder),
            withLatestFrom(this.store.select(selectDefinitions)),
            switchMap(([{ fields: updatedFields }, definitions]) => {
                return from(this.assetService.updateFields(updatedFields, definitions)).pipe(
                    map(() => CustomModelActions.updateFieldsOrderSuccess({ fields: updatedFields })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 3. addTableField
    addTableField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.addTableField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectDefinitions)
            ),
            switchMap(([{ fieldKey, tableType, headerType }, fields, definitions]) => {
                return from(
                    (async () => {
                        const getTableFields = (ht: HeaderType, fieldType: any) =>
                            new Array(2).fill(null).map((_, index) => ({
                                fieldKey: ht === HeaderType.column ? `COLUMN${index + 1}` : `ROW${index + 1}`,
                                fieldType,
                                fieldFormat: FieldFormat.NotSpecified,
                            }));

                        const objectName = `${fieldKey}_object`;
                        let field: any = { fieldKey, fieldFormat: FieldFormat.NotSpecified };
                        let definition: any = {
                            fieldKey: objectName,
                            fieldType: FieldType.Object,
                            fieldFormat: FieldFormat.NotSpecified,
                        };

                        if (tableType === TableType.dynamic) {
                            field = { ...field, fieldType: FieldType.Array, itemType: objectName };
                            definition = { ...definition, fields: getTableFields(HeaderType.column, FieldType.String) };
                        } else {
                            if (headerType === HeaderType.column) {
                                field = {
                                    ...field,
                                    fieldType: FieldType.Object,
                                    fields: getTableFields(HeaderType.row, objectName),
                                    visualizationHint: VisualizationHint.Vertical,
                                };
                                definition = { ...definition, fields: getTableFields(HeaderType.column, FieldType.String) };
                            } else {
                                field = {
                                    ...field,
                                    fieldType: FieldType.Object,
                                    fields: getTableFields(HeaderType.column, objectName),
                                    visualizationHint: VisualizationHint.Horizontal,
                                };
                                definition = { ...definition, fields: getTableFields(HeaderType.row, FieldType.String) };
                            }
                        }

                        const updatedFields = fields.concat(field);
                        const updatedDefinitions = { ...definitions, [objectName]: definition };

                        await this.assetService.updateFields(updatedFields, updatedDefinitions);
                        return { fields: updatedFields, definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ fields: updatedFields, definitions: updatedDefinitions }) =>
                        CustomModelActions.addTableFieldSuccess({ fields: updatedFields, definitions: updatedDefinitions })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 4. switchSubType
    switchSubType$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.switchSubType),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectDefinitions)
            ),
            switchMap(([{ fieldKey, fieldType }, fields, definitions]) => {
                return from(
                    (async () => {
                        const fieldIndex = fields.findIndex((f) => f.fieldKey === fieldKey);
                        const updatedField = { ...fields[fieldIndex], fieldType };
                        const updatedFields = fields.slice();
                        updatedFields.splice(fieldIndex, 1, updatedField);
                        await this.assetService.updateFields(updatedFields, definitions);
                        return { index: fieldIndex, field: updatedField };
                    })()
                ).pipe(
                    map(({ index, field }) =>
                        CustomModelActions.switchSubTypeSuccess({ index, field })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 5. switchTableFieldsSubType
    switchTableFieldsSubType$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.switchTableFieldsSubType),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectDefinitions)
            ),
            switchMap(([{ tableFieldKey, headerField, newType }, fields, definitions]) => {
                return from(
                    (async () => {
                        const { fieldKey, fieldType } = headerField;
                        if (fieldType === newType) {
                            return { definitions };
                        }

                        const updatedDefinitions = { ...definitions };
                        const originTableFieldIndex = fields.findIndex((f) => f.fieldKey === tableFieldKey);
                        const originTableField: any = fields[originTableFieldIndex];

                        const fieldDefinitionNames = originTableField.itemType
                            ? [originTableField.itemType]
                            : originTableField.fields.map((f: any) => f.fieldType);

                        fieldDefinitionNames.forEach((name: string) => {
                            const definition = { ...definitions[name] };
                            const updatedFields = definition.fields.map((f: any) =>
                                f.fieldKey === fieldKey ? { ...f, fieldType: newType } : f
                            );
                            updatedDefinitions[name] = { ...definition, fields: updatedFields };
                        });

                        await this.assetService.updateFields(fields, updatedDefinitions);
                        return { definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ definitions: updatedDefinitions }) =>
                        CustomModelActions.switchTableFieldsSubTypeSuccess({ definitions: updatedDefinitions })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 6. deleteField
    deleteField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.deleteField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectLabels),
                this.store.select(selectDefinitions),
                this.store.select(selectDocuments)
            ),
            switchMap(([{ fieldKey }, fields, labels, definitions, documents]) => {
                return from(
                    (async () => {
                        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

                        const updatedLabels: { [key: string]: any[] } = {};
                        Object.entries(allLabels as Record<string, any[]>).forEach(([documentName, docLabels]) => {
                            if (docLabels.find((label) => getFieldKeyFromLabel(label) === fieldKey)) {
                                const updatedDocLabels = docLabels.filter(
                                    (label) => getFieldKeyFromLabel(label) !== fieldKey
                                );
                                updatedLabels[documentName] = updatedDocLabels;
                            }
                        });
                        allLabels = { ...allLabels, ...updatedLabels };

                        const updatedFields = fields.filter((f) => f.fieldKey !== fieldKey);
                        const targetField: any = fields.find((f) => f.fieldKey === fieldKey)!;
                        const updatedDefinitions = { ...definitions };
                        if (targetField.itemType) {
                            delete updatedDefinitions[targetField.itemType];
                        }
                        if (targetField.fields) {
                            const fieldTypesToDelete = targetField.fields.map((f: any) => f.fieldType);
                            fieldTypesToDelete.forEach((ft: string) => delete updatedDefinitions[ft]);
                        }

                        await Promise.all([
                            this.assetService.updateFields(updatedFields, updatedDefinitions),
                            this.assetService.updateDocumentLabels(updatedLabels),
                        ]);

                        return { fields: updatedFields, labels: allLabels, definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ fields: updatedFields, labels: updatedLabels, definitions: updatedDefinitions }) =>
                        CustomModelActions.deleteFieldSuccess({
                            fields: updatedFields,
                            labels: updatedLabels,
                            definitions: updatedDefinitions,
                        })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 7. renameField
    renameField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.renameField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectLabels),
                this.store.select(selectDefinitions),
                this.store.select(selectDocuments)
            ),
            switchMap(([{ fieldKey, newName }, fields, labels, definitions, documents]) => {
                return from(
                    (async () => {
                        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

                        // Update labels.
                        const updatedLabels: { [key: string]: any[] } = {};
                        Object.entries(allLabels as Record<string, any[]>).forEach(([documentName, docLabels]: [string, any[]]) => {
                            if (docLabels.find((label: any) => getFieldKeyFromLabel(label) === fieldKey)) {
                                const updatedDocLabels = docLabels.map((label: any) => {
                                    if (getFieldKeyFromLabel(label) === fieldKey) {
                                        const newLabel = label.label.split("/");
                                        newLabel[0] = encodeLabelString(newName);
                                        return { ...label, label: newLabel.join("/") };
                                    }
                                    return label;
                                });
                                updatedLabels[documentName] = updatedDocLabels;
                            }
                        });
                        allLabels = { ...allLabels, ...updatedLabels };

                        // Update fields.
                        const newObjectName = `${newName}_object`;
                        const originFieldIndex = fields.findIndex((f) => f.fieldKey === fieldKey);
                        const originField: any = fields[originFieldIndex];
                        const updatedField = {
                            ...originField,
                            ...(originField.itemType && { itemType: newObjectName }),
                            ...(originField.fields && {
                                fields: originField.fields.map((f: any) => ({ ...f, fieldType: newObjectName })),
                            }),
                            fieldKey: newName,
                        };
                        const updatedFields = [...fields];
                        updatedFields.splice(originFieldIndex, 1, updatedField);

                        // Update definitions.
                        const updatedDefinitions = { ...definitions };
                        if (originField.itemType) {
                            updatedDefinitions[newObjectName] = {
                                ...updatedDefinitions[originField.itemType],
                                fieldKey: newObjectName,
                            };
                            delete updatedDefinitions[originField.itemType];
                        }
                        if (originField.fields) {
                            const originFieldTypes = originField.fields.map((f: any) => f.fieldType);
                            updatedDefinitions[newObjectName] = {
                                ...updatedDefinitions[originFieldTypes[0]],
                                fieldKey: newObjectName,
                            };
                            originFieldTypes.forEach((ft: string) => delete updatedDefinitions[ft]);
                        }

                        await Promise.all([
                            this.assetService.updateFields(updatedFields, updatedDefinitions),
                            this.assetService.updateDocumentLabels(updatedLabels),
                        ]);

                        return { fields: updatedFields, labels: allLabels, definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ fields: updatedFields, labels: updatedLabels, definitions: updatedDefinitions }) =>
                        CustomModelActions.renameFieldSuccess({
                            fields: updatedFields,
                            labels: updatedLabels,
                            definitions: updatedDefinitions,
                        })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 8. deleteTableField
    deleteTableField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.deleteTableField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectLabels),
                this.store.select(selectDefinitions),
                this.store.select(selectDocuments)
            ),
            switchMap(([{ tableFieldKey, fieldKey, fieldLocation }, fields, labels, definitions, documents]) => {
                return from(
                    (async () => {
                        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

                        // Update labels.
                        const updatedLabels: { [key: string]: any[] } = {};
                        const isTargetLabel = (label: any) =>
                            getFieldKeyFromLabel(label) === tableFieldKey &&
                            getTableFieldKeyFromLabel(label, fieldLocation) === fieldKey;

                        Object.entries(allLabels as Record<string, any[]>).forEach(([documentName, docLabels]: [string, any[]]) => {
                            if (docLabels.find(isTargetLabel)) {
                                const updatedDocLabels = docLabels.filter((label: any) => !isTargetLabel(label));
                                updatedLabels[documentName] = updatedDocLabels;
                            }
                        });
                        allLabels = { ...allLabels, ...updatedLabels };

                        const updatedFields = [...fields];
                        const updatedDefinitions = { ...definitions };
                        const originTableFieldIndex = fields.findIndex((f) => f.fieldKey === tableFieldKey);
                        const originTableField: any = fields[originTableFieldIndex];

                        if (fieldLocation === FieldLocation.field) {
                            const tableFields = originTableField.fields.filter((f: any) => f.fieldKey !== fieldKey);
                            updatedFields.splice(originTableFieldIndex, 1, { ...originTableField, fields: tableFields });
                        } else {
                            const objectName = originTableField.itemType || originTableField.fields[0].fieldType;
                            const definition = { ...definitions[objectName] };
                            const definitionFields = definition.fields.filter((f: any) => f.fieldKey !== fieldKey);
                            updatedDefinitions[objectName] = { ...definition, fields: definitionFields };
                        }

                        await Promise.all([
                            this.assetService.updateFields(updatedFields, updatedDefinitions),
                            this.assetService.updateDocumentLabels(updatedLabels),
                        ]);

                        return { fields: updatedFields, labels: allLabels, definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ fields: updatedFields, labels: updatedLabels, definitions: updatedDefinitions }) =>
                        CustomModelActions.deleteTableFieldSuccess({
                            fields: updatedFields,
                            labels: updatedLabels,
                            definitions: updatedDefinitions,
                        })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 9. insertTableField
    insertTableField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.insertTableField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectDefinitions)
            ),
            switchMap(([{ tableFieldKey, fieldKey, index, fieldLocation }, fields, definitions]) => {
                return from(
                    (async () => {
                        const updatedFields = [...fields];
                        const updatedDefinitions = { ...definitions };
                        const originTableFieldIndex = fields.findIndex((f) => f.fieldKey === tableFieldKey);
                        const originTableField: any = fields[originTableFieldIndex];
                        const objectName = originTableField.itemType || originTableField.fields[0].fieldType;
                        const insertField: any = {
                            fieldKey,
                            fieldType: fieldLocation === FieldLocation.field ? objectName : FieldType.String,
                            fieldFormat: FieldFormat.NotSpecified,
                        };

                        if (fieldLocation === FieldLocation.field) {
                            const insertedFields = originTableField.fields.slice();
                            insertedFields.splice(index, 0, insertField);
                            const updatedTableField = { ...originTableField, fields: insertedFields };
                            updatedFields.splice(originTableFieldIndex, 1, updatedTableField);
                        } else {
                            const insertedFields = definitions[objectName].fields.slice();
                            insertedFields.splice(index, 0, insertField);
                            updatedDefinitions[objectName] = { ...definitions[objectName], fields: insertedFields };
                        }

                        await this.assetService.updateFields(updatedFields, updatedDefinitions);
                        return { fields: updatedFields, definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ fields: updatedFields, definitions: updatedDefinitions }) =>
                        CustomModelActions.insertTableFieldSuccess({
                            fields: updatedFields,
                            definitions: updatedDefinitions,
                        })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 10. renameTableField
    renameTableField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.renameTableField),
            withLatestFrom(
                this.store.select(selectFields),
                this.store.select(selectLabels),
                this.store.select(selectDefinitions),
                this.store.select(selectDocuments)
            ),
            switchMap(([{ tableFieldKey, fieldKey, newName, fieldLocation }, fields, labels, definitions, documents]) => {
                return from(
                    (async () => {
                        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

                        // Update labels.
                        const updatedLabels: { [key: string]: any[] } = {};
                        const isTargetLabel = (label: any) =>
                            getFieldKeyFromLabel(label) === tableFieldKey &&
                            getTableFieldKeyFromLabel(label, fieldLocation) === fieldKey;

                        Object.entries(allLabels as Record<string, any[]>).forEach(([documentName, docLabels]: [string, any[]]) => {
                            if (docLabels.find(isTargetLabel)) {
                                const updatedDocLabels = docLabels.map((label: any) => {
                                    if (isTargetLabel(label)) {
                                        const newLabel = label.label.split("/");
                                        const labelIndex = fieldLocation === FieldLocation.field ? 1 : 2;
                                        newLabel[labelIndex] = encodeLabelString(newName);
                                        return { ...label, label: newLabel.join("/") };
                                    }
                                    return label;
                                });
                                updatedLabels[documentName] = updatedDocLabels;
                            }
                        });
                        allLabels = { ...allLabels, ...updatedLabels };

                        const updatedFields = [...fields];
                        const updatedDefinitions = { ...definitions };
                        const originTableFieldIndex = fields.findIndex((f) => f.fieldKey === tableFieldKey);
                        const originTableField: any = fields[originTableFieldIndex];

                        if (fieldLocation === FieldLocation.field) {
                            const tableFields = originTableField.fields.map((f: any) =>
                                f.fieldKey === fieldKey ? { ...f, fieldKey: newName } : f
                            );
                            updatedFields.splice(originTableFieldIndex, 1, { ...originTableField, fields: tableFields });
                        } else {
                            const objectName = originTableField.itemType || originTableField.fields[0].fieldType;
                            const definition = { ...definitions[objectName] };
                            const definitionFields = definition.fields.map((f: any) =>
                                f.fieldKey === fieldKey ? { ...f, fieldKey: newName } : f
                            );
                            updatedDefinitions[objectName] = { ...definition, fields: definitionFields };
                        }

                        await Promise.all([
                            this.assetService.updateFields(updatedFields, updatedDefinitions),
                            this.assetService.updateDocumentLabels(updatedLabels),
                        ]);

                        return { fields: updatedFields, labels: allLabels, definitions: updatedDefinitions };
                    })()
                ).pipe(
                    map(({ fields: updatedFields, labels: updatedLabels, definitions: updatedDefinitions }) =>
                        CustomModelActions.renameTableFieldSuccess({
                            fields: updatedFields,
                            labels: updatedLabels,
                            definitions: updatedDefinitions,
                        })
                    ),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 11. deleteLabelByField
    deleteLabelByField$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.deleteLabelByField),
            withLatestFrom(
                this.store.select(selectLabels),
                this.store.select(selectCurrentDocument)
            ),
            switchMap(([{ fieldKey }, labels, currentDocument]) => {
                if (!currentDocument) {
                    return of(CustomModelActions.customModelOperationFailure({
                        error: makeError("No document", "No current document selected."),
                    }));
                }
                const documentName = currentDocument.name;
                const updatedDocumentLabels = {
                    [documentName]: labels[documentName].filter(
                        (label) => getFieldKeyFromLabel(label) !== fieldKey
                    ),
                };
                const updatedLabels = { ...labels, ...updatedDocumentLabels };

                return from(this.assetService.updateDocumentLabels(updatedDocumentLabels)).pipe(
                    map(() => CustomModelActions.deleteLabelByFieldSuccess({ labels: updatedLabels })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 12. deleteLabelByLabel
    deleteLabelByLabel$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.deleteLabelByLabel),
            withLatestFrom(
                this.store.select(selectLabels),
                this.store.select(selectCurrentDocument)
            ),
            switchMap(([{ targetLabel }, labels, currentDocument]) => {
                if (!currentDocument) {
                    return of(CustomModelActions.customModelOperationFailure({
                        error: makeError("No document", "No current document selected."),
                    }));
                }
                const documentName = currentDocument.name;
                const updatedDocumentLabels = {
                    [documentName]: labels[documentName].filter((label) => label.label !== targetLabel),
                };
                const updatedLabels = { ...labels, ...updatedDocumentLabels };

                return from(this.assetService.updateDocumentLabels(updatedDocumentLabels)).pipe(
                    map(() => CustomModelActions.deleteLabelByLabelSuccess({ labels: updatedLabels })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 13. assignLabel
    assignLabel$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.assignLabel),
            withLatestFrom(
                this.store.select(selectLabels),
                this.store.select(selectFields),
                this.store.select(selectLabelValueCandidates),
                this.store.select(selectOrders),
                this.store.select(selectCurrentDocument)
            ),
            switchMap(([{ labelName }, labels, fields, labelValueCandidates, orders, currentDocument]) => {
                return from(
                    (async () => {
                        if (labelValueCandidates.length === 0) {
                            return labels;
                        }

                        // Step 1. Remove duplicated items in LabelValueCandidates.
                        const uniqueCandidates = uniqueByKeepFirst(
                            labelValueCandidates,
                            (item: any) => JSON.stringify(item.boundingBoxes)
                        );

                        // Step 2. Check invalid assignment and throw errors.
                        const fieldKey = decodeLabelString(labelName.split("/")[0]);
                        const field = fields.find((f) => f.fieldKey === fieldKey);
                        validateAssignment(uniqueCandidates, field!);

                        // Step 3. Check cross-page label issue and throw errors.
                        const { name: documentName, currentPage } = currentDocument!;
                        const labelValueCandidatePageNum = labelValueCandidates[0].page;
                        const currLabelValuePageNum = labels[documentName]?.find(
                            ({ label }) => label === labelName
                        )?.value[0].page;

                        if (currLabelValuePageNum && labelValueCandidatePageNum !== currLabelValuePageNum) {
                            const crossPageLabelError = makeError(
                                "Cross-page label error",
                                `Sorry, we don't support cross-page labeling with the same field. You have label regions with same field name <b>${labelName}</b> across 2 pages.`
                            );
                            throw crossPageLabelError;
                        }

                        // Step 4. Remove existed label.value if it occurred in uniqueCandidates.
                        const uniqCandidateBoxes = uniqueCandidates.map((candidate: any) =>
                            JSON.stringify(candidate.boundingBoxes)
                        );
                        const documentLabels = labels[documentName]
                            ? labels[documentName].slice().map((documentLabel) => {
                                  const labelPageNum = documentLabel.value[0].page;
                                  const remainingValue = documentLabel.value.filter(
                                      (value) =>
                                          labelValueCandidatePageNum !== labelPageNum ||
                                          !uniqCandidateBoxes.includes(JSON.stringify(value.boundingBoxes))
                                  );

                                  if (remainingValue.length !== documentLabel.value.length) {
                                      return { ...documentLabel, value: remainingValue };
                                  }
                                  return documentLabel;
                              })
                            : [];

                        // Step 5. Check if labelName existed in documentLabels.
                        const iLabel = documentLabels.findIndex((docLabel) => docLabel.label === labelName);
                        const candidatesValue: LabelValue[] = uniqueCandidates.map(makeLabelValue);
                        const isSingleDrawRegion =
                            uniqueCandidates.length === 1 &&
                            uniqueCandidates[0].category === FeatureCategory.DrawnRegion;

                        if (iLabel === -1) {
                            // Step 5.a. Add label.
                            documentLabels.push({
                                label: labelName,
                                value: candidatesValue.sort((a, b) =>
                                    compareOrder(a, b, orders[documentName], currentPage)
                                ),
                                labelType: isSingleDrawRegion ? LabelType.Region : undefined,
                            });
                        } else {
                            // Step 5.b. Merge or replace label.
                            if (isSingleDrawRegion) {
                                documentLabels[iLabel] = {
                                    ...documentLabels[iLabel],
                                    value: candidatesValue,
                                    labelType: LabelType.Region,
                                };
                            } else if (
                                field?.fieldType === FieldType.Signature ||
                                field?.fieldType === FieldType.SelectionMark
                            ) {
                                documentLabels[iLabel] = {
                                    ...documentLabels[iLabel],
                                    value: candidatesValue,
                                };
                            } else if (documentLabels[iLabel].labelType === LabelType.Region) {
                                // Replace the existing region with text.
                                documentLabels[iLabel] = {
                                    ...documentLabels[iLabel],
                                    value: candidatesValue.sort((a, b) =>
                                        compareOrder(a, b, orders[documentName], currentPage)
                                    ),
                                    labelType: undefined,
                                };
                            } else {
                                // Concat text.
                                documentLabels[iLabel] = {
                                    ...documentLabels[iLabel],
                                    value: documentLabels[iLabel].value
                                        .concat(candidatesValue)
                                        .sort((a, b) =>
                                            compareOrder(a, b, orders[documentName], currentPage)
                                        ),
                                };
                            }
                        }

                        // Step 6. Remove empty label.
                        const updatedLabel = {
                            [documentName]: documentLabels.filter((label) => label.value.length > 0),
                        };

                        // Step 7: save labels.json
                        await this.assetService.updateDocumentLabels(updatedLabel);

                        return { ...labels, ...updatedLabel };
                    })()
                ).pipe(
                    map((updatedLabels) => CustomModelActions.assignLabelSuccess({ labels: updatedLabels })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 14a. updateLabel
    updateLabel$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.updateLabel),
            withLatestFrom(
                this.store.select(selectLabels),
                this.store.select(selectCurrentDocument)
            ),
            switchMap(([{ labelName, oldCandidate, newCandidate }, labels, currentDocument]) => {
                return from(
                    (async () => {
                        const documentName = currentDocument!.name;

                        // Find Label
                        const iLabel = labels[documentName].findIndex((label) => label.label === labelName);
                        if (iLabel === -1) {
                            return labels;
                        }

                        const updatedDocumentLabels = {
                            [documentName]: labels[documentName].map((label, index) => {
                                if (index === iLabel) {
                                    const updatedLabelValue = label.value.map((value) => {
                                        if (
                                            JSON.stringify(value.boundingBoxes) ===
                                            JSON.stringify(oldCandidate.boundingBoxes)
                                        ) {
                                            return { ...value, boundingBoxes: newCandidate.boundingBoxes };
                                        }
                                        return value;
                                    });
                                    return { ...label, value: updatedLabelValue };
                                }
                                return label;
                            }),
                        };

                        await this.assetService.updateDocumentLabels(updatedDocumentLabels);
                        return { ...labels, ...updatedDocumentLabels };
                    })()
                ).pipe(
                    map((updatedLabels) => CustomModelActions.updateLabelSuccess({ labels: updatedLabels })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    // 14b. updateTableLabel
    updateTableLabel$ = createEffect(() =>
        this.actions$.pipe(
            ofType(CustomModelActions.updateTableLabel),
            withLatestFrom(
                this.store.select(selectLabels),
                this.store.select(selectCurrentDocument)
            ),
            switchMap(([{ tableFieldKey, newLabel }, labels, currentDocument]) => {
                if (!currentDocument) {
                    return of(CustomModelActions.updateTableLabelSuccess({ labels }));
                }

                const remainingLabels = labels[currentDocument.name].filter(
                    (label) => getFieldKeyFromLabel(label) !== tableFieldKey
                );
                const updatedDocumentLabels = {
                    [currentDocument.name]: [...remainingLabels, ...newLabel],
                };
                const updatedLabels = { ...labels, ...updatedDocumentLabels };

                return from(this.assetService.updateDocumentLabels(updatedDocumentLabels)).pipe(
                    map(() => CustomModelActions.updateTableLabelSuccess({ labels: updatedLabels })),
                    catchError((error) =>
                        of(CustomModelActions.customModelOperationFailure({ error }))
                    )
                );
            })
        )
    );

    constructor(
        private actions$: Actions,
        private store: Store,
        private assetService: CustomModelAssetService
    ) {}
}
