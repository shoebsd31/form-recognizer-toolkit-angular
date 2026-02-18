import { Routes } from "@angular/router";
import { CustomModelLabelPageComponent } from "./containers/custom-model-label-page/custom-model-label-page.component";

export const routes: Routes = [
    { path: "label", component: CustomModelLabelPageComponent },
    { path: "", redirectTo: "/label", pathMatch: "full" },
];
