import { Injectable, Inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { LABELING_CONFIG, LabelingConfig } from "../models/labeling-config";
import QueueMap from "../utils/queue-map/queue-map";

export interface IStorageProviderError {
    code: string;
    message: string;
}

@Injectable({ providedIn: "root" })
export class StorageProviderService {
    private serverUrl: string;
    private queueMap = new QueueMap();

    constructor(
        private http: HttpClient,
        @Inject(LABELING_CONFIG) private config: LabelingConfig,
    ) {
        this.serverUrl = config.serverSiteUrl;
    }

    async isValidConnection(): Promise<boolean | undefined> {
        try {
            const result = await firstValueFrom(this.http.get<any>(this.serverUrl));
            return result.success;
        } catch (ex) {
            this.storageErrorHandler(ex);
            return undefined;
        }
    }

    async readText(filename: string, ignoreNotFound?: boolean): Promise<string | undefined> {
        try {
            const api = `${this.serverUrl}/files/${filename}`;
            const result = await firstValueFrom(this.http.get<any>(api));
            return JSON.stringify(result);
        } catch (ex) {
            this.storageErrorHandler(ex, ignoreNotFound);
            return undefined;
        }
    }

    async readBinary(filename: string, ignoreNotFound?: boolean): Promise<ArrayBuffer | undefined> {
        try {
            const api = `${this.serverUrl}/files/${filename}`;
            const result = await firstValueFrom(
                this.http.get(api, { responseType: "arraybuffer" })
            );
            return result;
        } catch (ex) {
            this.storageErrorHandler(ex, ignoreNotFound);
            return undefined;
        }
    }

    async writeText(filename: string, content: string): Promise<void> {
        const writeOp = async () => {
            try {
                const api = `${this.serverUrl}/files/${filename}`;
                await firstValueFrom(this.http.put(api, { content }));
            } catch (ex) {
                this.storageErrorHandler(ex);
            }
        };

        this.queueMap.enque(filename, [content]);
        this.queueMap.on(filename, writeOp);
    }

    async writeBinary(filename: string, content: ArrayBuffer): Promise<void> {
        try {
            const api = `${this.serverUrl}/files/${filename}`;
            await firstValueFrom(this.http.put(api, { content }));
        } catch (ex) {
            this.storageErrorHandler(ex);
        }
    }

    async deleteFile(filename: string, ignoreNotFound?: boolean): Promise<void> {
        try {
            const api = `${this.serverUrl}/files/${filename}`;
            await firstValueFrom(this.http.delete(api));
        } catch (ex) {
            this.storageErrorHandler(ex, ignoreNotFound);
        }
    }

    async listFilesInFolder(extension?: string): Promise<string[]> {
        let files: string[] = [];
        try {
            const api = `${this.serverUrl}/files`;
            const result = await firstValueFrom(this.http.get<string[]>(api));
            files = result;
        } catch (ex) {
            this.storageErrorHandler(ex);
        }
        return files;
    }

    async isFileExists(filename: string, ignoreNotFound?: boolean): Promise<boolean> {
        try {
            const api = `${this.serverUrl}/files/${filename}`;
            const result = await firstValueFrom(this.http.get<any>(api));
            return result !== null;
        } catch (ex) {
            this.storageErrorHandler(ex, ignoreNotFound);
        }
        return false;
    }

    private storageErrorHandler = (exception: any, ignoreNotFound?: boolean) => {
        if (exception?.status === 404 && ignoreNotFound) {
            return;
        }
        const error: IStorageProviderError = {
            code: "Failed to access local files",
            message: "Failed to send request to local server. Please check your server connection.",
        };
        throw error;
    };
}
