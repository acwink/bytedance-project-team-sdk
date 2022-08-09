import { BehaviorStack } from '@websrc/core/behaviorStore';
import { IMetrics } from '@websrc/core/performanceStore';
import { HttpMetrics } from '@websrc/plugins/UserVitals';
// 错误类型
export enum mechanismType {
  JS = 'js',
  RS = 'resource',
  UJ = 'unhandledrejection',
  HP = 'http',
  CS = 'cors',
  VUE = 'vue',
}

// 格式化后的 异常数据结构体
export interface ExceptionMetrics {
  mechanism: any;
  value?: string;
  type: string;
  stackTrace?: any;
  pageInformation?: any;
  // breadcrumbs?: Array<BehaviorStack>;
  breadcrumbs?: any;
  errorUid: string;
  meta?: any;
}

// 初始化参数
export interface ErrorVitalsInitOptions {
  Vue: any;
}

// 静态资源错误的ErrorTarget
export interface ResourceErrorTarget {
  src?: string;
  tagName: string;
  outerHTML?: string;
}

export const getErrorUid = (input: string) => {
  return window.btoa(unescape(encodeURIComponent(input)));
};

// 正则表达式，用以解析堆栈split后得到的字符串
const FULL_MATCH =
  /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[-a-z]+:|.*bundle|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;

// 限制值追溯 10 个
const STACKTRACE_LIMIT = 10;

// 解析每一行
export function parseStackLine(line: string) {
  const lineMatch = line.match(FULL_MATCH);
  if (!lineMatch) return {};
  const filename = lineMatch[2];
  const functionName = lineMatch[1] || '';
  const lineno = parseInt(lineMatch[3], 10) || undefined;
  const colno = parseInt(lineMatch[4], 10) || undefined;
  return {
    filename,
    functionName,
    lineno,
    colno,
  };
}
// 解析错误堆栈
export function parseStackFrames(error: Error) {
  const { stack } = error;
  // 无 stack 直接返回
  if (!stack) return [];
  const frames = [];
  for (const line of stack.split('\n').slice(1)) {
    const frame = parseStackLine(line);
    if (frame) {
      frames.push(frame);
    }
    if (frames.length >= STACKTRACE_LIMIT) {
      break;
    }
  }

  return frames;
}

export const proxyXmlHttp = (sendHandler: Function | null | undefined, loadHandler: Function) => {
  if ('XMLHttpRequest' in window && typeof window.XMLHttpRequest === 'function') {
    const oldXMLHttpRequest = window.XMLHttpRequest;

    // 备份用于sdk数据上报
    if (!(window as any).oldXMLHttpRequest) {
      (window as any).oldXMLHttpRequest = oldXMLHttpRequest;
    }

    (window as any).XMLHttpRequest = () => {
      const xhr = new oldXMLHttpRequest();
      const { open, send } = xhr;
      let metrics: IMetrics = {};
      xhr.open = (method, url) => {
        metrics.method = method;
        metrics.url = url;
        open.call(xhr, method, url, true);
      };

      xhr.send = (body) => {
        metrics.body = body ?? '';
        metrics.requestTime = new Date().getTime();
        // sendHandler 可以在发送 Ajax 请求之前，挂载一些信息，比如 header 请求头
        // setRequestHeader 设置请求header，用来传输关键参数等
        // xhr.setRequestHeader('xxx-id', 'VQVE-QEBQ');
        if (typeof sendHandler === 'function') sendHandler(xhr);
        send.call(xhr, body);
      };

      xhr.addEventListener('loadend', () => {
        const { status, statusText, response } = xhr;
        metrics = {
          ...metrics,
          status,
          statusText,
          response,
          responseTime: new Date().getTime(),
        };
        if (typeof loadHandler === 'function') loadHandler(metrics);
      });

      return xhr;
    };
  }
};

export const proxyFetch = (sendHandler: Function | null | undefined, loadHandler: Function) => {
  if ('fetch' in window && typeof window.fetch === 'function') {
    const oldFetch = window.fetch;
    if (!(window as any).oldFetch) {
      (window as any).oldFetch = oldFetch;
    }
    (window as any).fetch = async (input: any, init: any) => {
      if (typeof sendHandler === 'function') sendHandler(init);
      let metrics: IMetrics = {};

      metrics.method = init?.method || '';
      metrics.url = (input && typeof input !== 'string' ? input?.url : input) || '';
      metrics.body = init?.body || '';
      metrics.requestTime = new Date().getTime();

      return oldFetch.call(window, input, init).then(async (response) => {
        const res = response.clone();
        metrics = {
          ...metrics,
          status: res.status,
          statusText: res.statusText,
          response: await res.text(),
          responseTime: new Date().getTime(),
        };

        if (typeof loadHandler === 'function') loadHandler(metrics);
        return response;
      });
    };
  }
};

// 判断是 JS 异常、静态资源异常、还是跨域异常
export const getErrorKey = (event: ErrorEvent | Event) => {
  const isJsError = event instanceof ErrorEvent;
  if (!isJsError) return mechanismType.RS;
  return event.message === 'Script error.' ? mechanismType.CS : mechanismType.JS;
};

export interface Vue {
  config: {
    errorHandler?: any;
    warnHandler?: any;
  };
}

export interface ViewModel {
  _isVue?: boolean;
  __isVue?: boolean;
  $root: ViewModel;
  $parent?: ViewModel;
  $props: { [key: string]: any };
  $options: {
    name?: string;
    propsData?: { [key: string]: any };
    _componentTag?: string;
    __file?: string;
  };
}

const classifyRE = /(?:^|[-_])(\w)/g;
const classify = (str: string) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, '');
const ROOT_COMPONENT_NAME = '<Root>';
const ANONYMOUS_COMPONENT_NAME = '<Anonymous>';
export const formatComponentName = (vm: ViewModel, includeFile: Boolean) => {
  if (!vm) {
    return ANONYMOUS_COMPONENT_NAME;
  }
  if (vm.$root === vm) {
    return ROOT_COMPONENT_NAME;
  }
  const options = vm.$options;
  let name = options.name ?? options._componentTag;
  const file = options.__file;
  if (!name && file) {
    const match = file.match(/([^/\\]+)\.vue$/);
    if (match) {
      name = match[1];
    }
  }
  return (
    (name ? `<${classify(name)}>` : ANONYMOUS_COMPONENT_NAME) + (file && includeFile !== false ? ` at ${file}` : '')
  );
};

export default class ErrorVitals {
  private submitErrorUids: Array<string>;

  constructor(options: ErrorVitalsInitOptions) {
    const app = options;
    this.submitErrorUids = [];
    // 初始化 js错误
    this.initJsError();
    // 初始化 静态资源加载错误
    this.initResourceError();
    // 初始化 Promise异常
    this.initPromiseError();
    // 初始化 HTTP请求异常
    this.initHttpError();
    // 初始化 跨域异常
    this.initCorsError();
    // 初始化 Vue异常
    this.initVueError(app.Vue);
  }

  errorSendHandler = (data: ExceptionMetrics) => {
    const submitParams: ExceptionMetrics = {
      ...data,
      breadcrumbs: 'wait finish',
      pageInformation: 'wait finish',
    };

    // 判断同一个错误是否在本次页面访问中已经发生过了
    const hasSubmitStatus = this.submitErrorUids.includes(submitParams.errorUid);
    // 检查一下错误在本次页面中，是否已经产生过
    if (hasSubmitStatus) return;
    this.submitErrorUids.push(submitParams.errorUid);
    // 记录清除用户行为栈 breadcrumbs
    // 有错误立即上报
    console.log(submitParams);
  };

  // 初始化 JS异常 的数据获取和上报
  initJsError = (): void => {
    const handler = (event: ErrorEvent) => {
      // 阻止向上抛出控制台报错
      event.preventDefault();
      // 如果不是JS异常 就结束
      if (getErrorKey(event) !== mechanismType.JS) return;

      const exception: ExceptionMetrics = {
        // 上报错误归类
        mechanism: {
          type: mechanismType.JS,
        },
        // 错误信息
        value: event.message,
        // 错误类型
        type: (event.error && event.error.name) || 'UnKnown',
        // 解析后的错误堆栈
        stackTrace: {
          frames: parseStackFrames(event.error),
        },
        // 用户行为追踪 breadcrumbs 在 errorSendHandler 中统一封装
        // 页面基本信息 pageInformation 也在 errorSendHandler 中统一封装
        // 错误的标识码
        errorUid: getErrorUid(`${mechanismType.JS}-${event.message}-${event.filename}`),
        // 附带信息
        meta: {
          // file 错误所处的文件地址
          file: event.filename,
          // col 错误序列号
          col: event.colno,
          // row 错误行号
          row: event.lineno,
        },
      };

      this.errorSendHandler(exception);
    };

    window.addEventListener('error', (event) => handler(event), true);
  };

  // 初始化 静态资源异常 的数据获取和上报
  initResourceError = (): void => {
    const handler = (event: Event) => {
      event.preventDefault();
      if (getErrorKey(event) !== mechanismType.RS) return;
      const target: any = event.target;
      const exception: ExceptionMetrics = {
        // 上报错误归类
        mechanism: {
          type: mechanismType.RS,
        },
        // 错误信息
        value: '',
        // 错误类型
        type: 'ResourceError',
        // 用户行为追踪 breadcrumbs 在 errorSendHandler 中统一封装
        // 页面基本信息 pageInformation 也在 errorSendHandler 中统一封装
        // 错误的标识码
        errorUid: getErrorUid(`${mechanismType.RS}-${target.src}-${target.tagName}`),
        // 附带信息
        meta: {
          url: target.src,
          html: target.outerHTML,
          type: target.tagName,
        },
      };

      // 错误立即上报，不用缓存在本地
      this.errorSendHandler(exception);
    };

    window.addEventListener('error', (event) => handler(event), true);
  };

  // 初始化 Promise异常 的数据获取和上报
  initPromiseError = (): void => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      const value = event.reason.message || event.reason;
      const type = event.reason.name || 'UnKnown';
      const exception: ExceptionMetrics = {
        mechanism: {
          type: mechanismType.UJ,
        },
        // 错误信息
        value,
        // 错误类型
        type,
        // 解析后的错误堆栈
        stackTrace: {
          frames: parseStackFrames(event.reason),
        },
        // 用户行为追踪 breadcrumbs 在 errorSendHandler 中统一封装
        // 页面基本信息 pageInformation 也在 errorSendHandler 中统一封装
        // 错误的标识码
        errorUid: getErrorUid(`${mechanismType.UJ}-${value}-${type}`),
        // 附带信息
        meta: {},
      };

      this.errorSendHandler(exception);
    };

    window.addEventListener('unhandledrejection', (event) => handler(event), true);
  };

  // 初始化 HTTP请求异常 的数据获取和上报
  initHttpError = (): void => {
    const loadHandler = (metrics: HttpMetrics) => {
      if (metrics.status < 400) return;

      const value = metrics.response;
      const exception: ExceptionMetrics = {
        mechanism: {
          type: mechanismType.HP,
        },
        // 错误信息
        value,
        // 错误类型
        type: 'HttpError',
        // 错误标识
        errorUid: getErrorUid(`${mechanismType.HP}-${value}-${metrics.statusText}`),
        // 附带信息
        meta: {
          metrics,
        },
      };
      this.errorSendHandler(exception);
    };

    proxyFetch(null, loadHandler);
    proxyXmlHttp(null, loadHandler);
  };

  // 初始化 跨域异常 的数据获取和上报
  initCorsError = (): void => {
    const handler = (event: ErrorEvent) => {
      // 阻止向上抛出到控制台
      event.preventDefault();
      // 如果不是跨域脚本异常，就结束
      if (getErrorKey(event) !== mechanismType.CS) return;
      const exception: ExceptionMetrics = {
        // 上报错误类型
        mechanism: {
          type: mechanismType.CS,
        },
        // 错误信息
        value: event.message,
        // 错误类型
        type: 'CorsError',
        // 错误标识码
        errorUid: getErrorUid(`${mechanismType.JS}-${event.message}`),
        meta: {},
      };
      this.errorSendHandler(exception);
    };
    window.addEventListener('error', (event) => handler(event), true);
  };

  // 初始化 Vue异常 的数据获取和上报
  initVueError = (app: Vue): void => {
    app.config.errorHandler = (err: Error, vm: ViewModel, info: string): void => {
      const componentName = formatComponentName(vm, false);
      const exception: ExceptionMetrics = {
        mechanism: {
          type: mechanismType.VUE,
        },
        value: err.message,
        type: err.name,
        stackTrace: {
          frames: parseStackFrames(err),
        },
        errorUid: getErrorUid(`${mechanismType.JS}-${err.message}-${componentName}-${info}`),
        meta: {
          componentName,
          hook: info,
        },
      };
      this.errorSendHandler(exception);
    };
  };
}
