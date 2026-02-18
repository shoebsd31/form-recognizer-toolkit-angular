import { Args, IQueue, Queue } from "./queue";

interface IQueueMap {
    [id: string]: IQueue;
}

export default class QueueMap {
    queueById: IQueueMap;
    constructor() {
        this.queueById = {};
    }

    getMap = (): IQueueMap => {
        return { ...this.queueById };
    };

    getQueueById = (id: string): IQueue => {
        if (!this.queueById[id]) {
            this.queueById[id] = new Queue();
        }
        return this.queueById[id];
    };

    enque = (id: string, args: Args) => {
        const { queue } = this.getQueueById(id);
        queue.push(args);
    };

    dequeue = (id: string): Args | undefined => {
        const { queue } = this.getQueueById(id);
        return queue.shift();
    };

    dequeueUntilLast = (id: string): Args => {
        let ret: Args = [];
        const { queue } = this.getQueueById(id);
        while (queue.length > 1) {
            ret = queue.shift()!;
        }
        return ret;
    };

    getLast = (id: string): Args => {
        const { queue } = this.getQueueById(id);
        if (queue.length) {
            return queue[queue.length - 1];
        }
        return [];
    };

    on = (
        id: string,
        method: (...args: any[]) => void,
        paramsHandler = (params: any) => params,
        errorHandler = console.error
    ) => {
        const q = this.getQueueById(id);
        const loop = async () => {
            q.isLooping = true;
            while (q.queue.length) {
                this.dequeueUntilLast(id);
                const args = this.getLast(id);
                const params = args.map(paramsHandler);
                try {
                    await method(...params);
                } catch (err) {
                    errorHandler(err);
                }
                this.dequeue(id);
            }
            q.isLooping = false;
        };
        if (q.isLooping === false) {
            q.promise = loop();
        }
    };

    callAfterLoop = async (id: string, callback: (...args: any[]) => void, args: Args = []) => {
        const q = this.getQueueById(id);
        if (q.promise) {
            await q.promise;
        }
        await callback(...args);
    };
}
