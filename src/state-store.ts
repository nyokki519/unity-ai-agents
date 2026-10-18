import type {StateData} from './model.js';
/** Shared storage boundary; implementations must commit atomically or roll back. */
export interface StateStore {
 read():Promise<StateData>;
 transaction<T>(mutate:(state:StateData)=>T|Promise<T>):Promise<T>;
}
