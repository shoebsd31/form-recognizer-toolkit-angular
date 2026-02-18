import { InjectionToken } from "@angular/core";

export interface LabelingConfig {
    serverSiteUrl: string;
    allowTable: boolean;
    allowDrawRegion: boolean;
    allowAddFields: boolean;
}

export const DEFAULT_LABELING_CONFIG: LabelingConfig = {
    serverSiteUrl: "",
    allowTable: true,
    allowDrawRegion: true,
    allowAddFields: true,
};

export const LABELING_CONFIG = new InjectionToken<LabelingConfig>("LabelingConfig");
