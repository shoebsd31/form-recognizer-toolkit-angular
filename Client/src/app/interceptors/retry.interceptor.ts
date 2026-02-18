import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { throwError, timer } from "rxjs";
import { retry } from "rxjs/operators";

const INITIAL_RETRY_INTERVAL = 500;
const MAX_RETRY = 3;
const TRANSIENT_STATUS_CODES = [408, 429, 444, 503, 504];

const isTransient = (error: HttpErrorResponse): boolean => {
    if (error.status === 429) {
        const errorData = error.error;
        if (errorData && errorData.error && errorData.error.code === "1014") {
            return false;
        }
    }
    return TRANSIENT_STATUS_CODES.includes(error.status);
};

export const retryInterceptor: HttpInterceptorFn = (req, next) => {
    return next(req).pipe(
        retry({
            count: MAX_RETRY,
            delay: (error: HttpErrorResponse, retryCount: number) => {
                if (!isTransient(error)) {
                    return throwError(() => error);
                }
                const delayMs = INITIAL_RETRY_INTERVAL * Math.pow(2, retryCount - 1);
                return timer(delayMs);
            },
        })
    );
};
