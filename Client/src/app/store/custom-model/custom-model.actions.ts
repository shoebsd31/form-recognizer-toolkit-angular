import { createAction, props } from "@ngrx/store";
import {
    Labels,
    Field,
    Definitions,
    LabelValueCandidate,
    FieldType,
    TableType,
    HeaderType,
    Label,
} from "../../models/custom-models";
import { FieldLocation, ICustomModelError } from "./custom-model.state";

// Sync actions
export const setHideInlineLabelMenu = createAction(
    "[CustomModel] Set Hide Inline Label Menu",
    props<{ hide: boolean }>()
);
export const setDefinitions = createAction("[CustomModel] Set Definitions", props<{ definitions: Definitions }>());
export const setFields = createAction("[CustomModel] Set Fields", props<{ fields: Field[] }>());
export const setColorForFields = createAction(
    "[CustomModel] Set Color For Fields",
    props<{ colorForFields: Record<string, string>[] }>()
);
export const setColorForFieldsByName = createAction(
    "[CustomModel] Set Color For Fields By Name",
    props<{ fieldName: string; newFieldName: string }>()
);
export const setLabelsByName = createAction("[CustomModel] Set Labels By Name", props<{ name: string; labels: any[] }>());
export const setLabelValueCandidates = createAction(
    "[CustomModel] Set Label Value Candidates",
    props<{ candidates: LabelValueCandidate[] }>()
);
export const deleteLabelByName = createAction("[CustomModel] Delete Label By Name", props<{ name: string }>());
export const clearLabelError = createAction("[CustomModel] Clear Label Error");

// Async actions
export const addField = createAction("[CustomModel] Add Field", props<{ field: Field }>());
export const addFieldSuccess = createAction("[CustomModel] Add Field Success", props<{ field: Field }>());
export const addFieldFailure = createAction("[CustomModel] Add Field Failure", props<{ error: any }>());

export const updateFieldsOrder = createAction("[CustomModel] Update Fields Order", props<{ fields: Field[] }>());
export const updateFieldsOrderSuccess = createAction(
    "[CustomModel] Update Fields Order Success",
    props<{ fields: Field[] }>()
);

export const addTableField = createAction(
    "[CustomModel] Add Table Field",
    props<{ fieldKey: string; tableType: TableType; headerType?: HeaderType }>()
);
export const addTableFieldSuccess = createAction(
    "[CustomModel] Add Table Field Success",
    props<{ fields: Field[]; definitions: Definitions }>()
);

export const switchSubType = createAction(
    "[CustomModel] Switch Sub Type",
    props<{ fieldKey: string; fieldType: FieldType }>()
);
export const switchSubTypeSuccess = createAction(
    "[CustomModel] Switch Sub Type Success",
    props<{ index: number; field: Field }>()
);

export const switchTableFieldsSubType = createAction(
    "[CustomModel] Switch Table Fields Sub Type",
    props<{ tableFieldKey: string; headerField: Field; newType: FieldType }>()
);
export const switchTableFieldsSubTypeSuccess = createAction(
    "[CustomModel] Switch Table Fields Sub Type Success",
    props<{ definitions: Definitions }>()
);

export const deleteField = createAction("[CustomModel] Delete Field", props<{ fieldKey: string }>());
export const deleteFieldSuccess = createAction(
    "[CustomModel] Delete Field Success",
    props<{ fields: Field[]; labels: Labels; definitions: Definitions }>()
);

export const renameField = createAction("[CustomModel] Rename Field", props<{ fieldKey: string; newName: string }>());
export const renameFieldSuccess = createAction(
    "[CustomModel] Rename Field Success",
    props<{ fields: Field[]; labels: Labels; definitions: Definitions }>()
);

export const deleteTableField = createAction(
    "[CustomModel] Delete Table Field",
    props<{ tableFieldKey: string; fieldKey: string; fieldLocation: FieldLocation }>()
);
export const deleteTableFieldSuccess = createAction(
    "[CustomModel] Delete Table Field Success",
    props<{ fields: Field[]; labels: Labels; definitions: Definitions }>()
);

export const insertTableField = createAction(
    "[CustomModel] Insert Table Field",
    props<{ tableFieldKey: string; fieldKey: string; index: number; fieldLocation: FieldLocation }>()
);
export const insertTableFieldSuccess = createAction(
    "[CustomModel] Insert Table Field Success",
    props<{ fields: Field[]; definitions: Definitions }>()
);

export const renameTableField = createAction(
    "[CustomModel] Rename Table Field",
    props<{ tableFieldKey: string; fieldKey: string; newName: string; fieldLocation: FieldLocation }>()
);
export const renameTableFieldSuccess = createAction(
    "[CustomModel] Rename Table Field Success",
    props<{ fields: Field[]; labels: Labels; definitions: Definitions }>()
);

export const deleteLabelByField = createAction("[CustomModel] Delete Label By Field", props<{ fieldKey: string }>());
export const deleteLabelByFieldSuccess = createAction(
    "[CustomModel] Delete Label By Field Success",
    props<{ labels: Labels }>()
);

export const deleteLabelByLabel = createAction("[CustomModel] Delete Label By Label", props<{ targetLabel: string }>());
export const deleteLabelByLabelSuccess = createAction(
    "[CustomModel] Delete Label By Label Success",
    props<{ labels: Labels }>()
);

export const assignLabel = createAction("[CustomModel] Assign Label", props<{ labelName: string }>());
export const assignLabelSuccess = createAction("[CustomModel] Assign Label Success", props<{ labels: Labels }>());

export const updateLabel = createAction(
    "[CustomModel] Update Label",
    props<{ labelName: string; oldCandidate: LabelValueCandidate; newCandidate: LabelValueCandidate }>()
);
export const updateLabelSuccess = createAction("[CustomModel] Update Label Success", props<{ labels: Labels }>());

export const updateTableLabel = createAction(
    "[CustomModel] Update Table Label",
    props<{ tableFieldKey: string; newLabel: Label[] }>()
);
export const updateTableLabelSuccess = createAction(
    "[CustomModel] Update Table Label Success",
    props<{ labels: Labels }>()
);

export const customModelOperationFailure = createAction(
    "[CustomModel] Operation Failure",
    props<{ error: ICustomModelError }>()
);
