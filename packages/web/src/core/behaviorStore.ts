import { metricsName } from '@websrc/core/userStore';

export interface BehaviorRecordsOptions {
  maxBehaviorRecords: number;
}

export interface BehaviorStack {
  name: metricsName;
  page: string;
  timestamp: number | string;
  value: any;
}

export default class BehaviorStore {
  // 数组形式的 stack
  private state: Array<BehaviorStack>;

  // 记录最大数量
  private maxBehaviorRecords: number;

  // 外部传入的options
  constructor(options: BehaviorRecordsOptions) {
    const { maxBehaviorRecords } = options;
    this.maxBehaviorRecords = maxBehaviorRecords;
    this.state = [];
  }

  // 从栈顶插入一个元素，且不超过最大数量
  push(value: BehaviorStack) {
    if (this.length() === this.maxBehaviorRecords) {
      this.shift();
    }
    this.state.push(value);
  }

  shift() {
    return this.state.shift();
  }

  length() {
    return this.state.length;
  }

  get() {
    return this.state;
  }

  clear() {
    this.state = [];
  }
}
