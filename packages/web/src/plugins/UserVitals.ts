import UserMetricsStore, { metricsName, IMetrics } from '@websrc/core/userStore';
import BehaviorStore, { BehaviorStack } from '@websrc/core/behaviorStore';
import { afterLoad } from '@websrc/plugins/WebVitals';

const parser = require('ua-parser-js');
const Bowser = require('bowser');
// 获取user-agent解析
function getFeature(userAgent: any) {
  const browserData = Bowser.parse(userAgent);
  const parserData = parser(userAgent);
  const browserName = browserData.browser.name || parserData.browser.name; // 浏览器名
  const browserVersion = browserData.browser.version || parserData.browser.version; // 浏览器版本号
  const osName = browserData.os.name || parserData.os.name; // 操作系统名
  const osVersion = parserData.os.version || browserData.os.version; // 操作系统版本号
  const deviceType = browserData.platform.type || parserData.device.type; // 设备类型
  const deviceVendor = browserData.platform.vendor || parserData.device.vendor || ''; // 设备所属公司
  const deviceModel = browserData.platform.model || parserData.device.model || ''; // 设备型号
  const engineName = browserData.engine.name || parserData.engine.name; // engine名
  const engineVersion = browserData.engine.version || parserData.engine.version; // engine版本号
  return {
    browserName,
    browserVersion,
    osName,
    osVersion,
    deviceType,
    deviceVendor,
    deviceModel,
    engineName,
    engineVersion,
  };
}

export interface PageInformation {
  host: string;
  hostname: string;
  href: string;
  protocol: string;
  origin: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;

  // 网页标题
  title: string;
  // 浏览器语言
  language: string;
  // 用户代理信息
  userAgent?: string;
  // 屏幕宽高
  winScreen: string;
  // 文档宽高
  docScreen: string;
}

// 这里参考了 谷歌GA 的自定义埋点上报数据维度结构
export interface CustomAnalyticsData {
  // 事件类别 互动的对象 eg:Video
  eventCategory: string;
  // 事件动作 互动动作方式 eg:play
  eventAction: string;
  // 事件标签 对事件进行分类 eg:
  eventLabel: string;
  // 事件值 与事件相关的数值   eg:180min
  eventValue?: string;
}

export interface HttpMetrics {
  method: string;
  url: string | URL;
  body: any;
  requestTime: number;
  responseTime: number;
  status: number;
  statusText: string;
  response?: any;
}

export interface OriginInformation {
  referrer: string;
  type: number | string;
}

// 派发出新的Event
const wr = (type: keyof History) => {
  const orig = window.history[type];
  return function createEvent(this: unknown, ...args: any[]) {
    const rv = orig.apply(this, args);
    const e = new Event(type);
    window.dispatchEvent(e);
    return rv;
  };
};

// 添加pushState replaceStat 事件
export const wrHistory = (): void => {
  window.history.pushState = wr('pushState');
  window.history.replaceState = wr('replaceState');
};

// 为 pushState 以及 replaceState 方法添加Event事件
export const proxyHistory = (handler: Function): void => {
  window.addEventListener('replaceState', (e) => handler(e), true);
  window.addEventListener('pushState', (e) => handler(e), true);
};

export const proxyHash = (handler: Function): void => {
  // 添加对 hashchange 的监听
  // hash 变化除了触发 hashchange ,也会触发 popstate 事件,而且会先触发 popstate 事件，我们可以统一监听 popstate
  // 这里可以考虑是否需要监听 hashchange,或者只监听 hashchange
  // window.addEventListener('hashchange', (e) => handler(e), true);
  window.addEventListener('popstate', (e) => handler(e), true);
};

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

export const getOriginInfo = (): OriginInformation => {
  return {
    referrer: document.referrer,
    type: window.performance?.navigation.type || '',
  };
};

export default class UserVitals {
  public metrics: UserMetricsStore;

  public breadcrumbs: BehaviorStore;

  public customHandler: Function;

  // 最大追踪记录数
  public maxBehaviorRecords: number;

  // 允许捕获click事件的标签 eg：button div img canvas
  clickMountList: Array<string>;

  constructor() {
    this.metrics = new UserMetricsStore();
    // 限制最大行为追踪记录数为 100，真实场景下需要外部传入自定义;
    this.maxBehaviorRecords = 100;
    // 初始化行为追踪记录
    this.breadcrumbs = new BehaviorStore({ maxBehaviorRecords: this.maxBehaviorRecords });
    // 初始化 用户自定义 事件捕获
    this.customHandler = this.initCustomerHandler();
    // 作为 真实sdk 的时候，需要在初始化时传入与默认值合并;
    this.clickMountList = ['button'].map((x) => x.toLowerCase());
    // 重写事件
    wrHistory();
    // 初始化页面基本信息
    this.initPageInfo();
    // 初始化路由跳转获取
    this.initRouteChange();
    // 初始化用户来路信息获取
    this.initOriginInfo();
    // 初始化 PV 的获取;
    this.initPV();
    // 初始化 click 事件捕获
    this.initClickHandler(this.clickMountList);
    // 初始化 Http 请求事件捕获
    this.initHttpHandler();
    // 上报策略在后几篇细说
    setInterval(() => {
      console.log(this.metrics);
    }, 5000);
  }

  // 封装用户行为的上报入口
  userSendHandler = (data: IMetrics) => {
    // 进行通知内核实例进行上报;
  };

  // 补齐 pathname 和 timestamp 参数
  getExtends = (): { page: string; timestamp: number | string } => {
    return {
      page: this.getPageInfo().pathname,
      timestamp: new Date().getTime(),
    };
  };

  // 初始化用户自定义埋点数据的获取上报
  initCustomerHandler = (): Function => {
    const handler = (options: CustomAnalyticsData) => {
      // 记录到UserMetricsStore
      this.metrics.add(metricsName.CDR, options);

      // 自定义埋点信息一般立即上报
      this.userSendHandler(options);
      // 记录到用户行为记录栈
      this.breadcrumbs.push({
        name: metricsName.CDR,
        value: options,
        ...this.getExtends(),
      });
    };
    return handler;
  };

  // 初始化 PI 页面基本信息的获取以及返回
  initPageInfo = (): void => {
    const info: PageInformation = this.getPageInfo();
    const metrics = info as IMetrics;
    this.metrics.set(metricsName.PI, metrics);
  };

  // 初始化 RCR 路由跳转的获取以及返回
  initRouteChange = (): void => {
    const handler = (e: Event) => {
      const metrics: IMetrics = {
        jumpType: e.type,
        timestamp: new Date().getTime(),
        pageInfo: this.getPageInfo(),
      };

      this.metrics.add(metricsName.RCR, { ...metrics });

      // 行为记录不需要携带pageInfo
      delete metrics.pageInfo;

      const behavior: BehaviorStack = {
        name: metricsName.RCR,
        value: metrics,
        ...this.getExtends(),
      };
      this.breadcrumbs.push(behavior);
    };
    proxyHash(handler);
    // 为pushState 以及 replaceState 添加Event事件方法
    proxyHistory(handler);
  };

  // 初始化 PV 的获取以及返回
  initPV = (): void => {
    const handler = () => {
      const metrics: IMetrics = {
        // 还有一些标识用户身份的信息，由项目使用方传入，任意拓展 eg:userId
        // 创建事件
        timestamp: new Date().getTime(),
        // 页面信息
        pageInfo: this.getPageInfo(),
        // 用户来路
        originInformation: getOriginInfo(),
      };

      // 上报数据
      this.userSendHandler(metrics);
    };
    afterLoad(() => {
      handler();
    });

    proxyHash(handler);
    // pushState 以及 replaceState 方法添加 Event 事件
    proxyHistory(handler);
  };

  // 初始化 OI 用户来路的获取以及返回
  initOriginInfo = (): void => {
    const info: OriginInformation = getOriginInfo();
    const metrics = info as IMetrics;
    this.metrics.set(metricsName.OI, metrics);
  };

  // 初始化 CBR 点击事件的获取和返回
  initClickHandler = (mountList: Array<string>): void => {
    const handler = (e: MouseEvent | any) => {
      // 这里更具tagname进行判断是否需要捕获事件
      let target = e.path?.find((x: Element) => mountList.includes(x.tagName?.toLowerCase()));

      target = target || (mountList.includes(e.target.tagName?.toLowerCase()) ? e.target : undefined);

      if (!target) return;
      const metrics: IMetrics = {
        tagInfo: {
          id: target.id,
          classList: Array.from(target.classList),
          tagName: target.tagName,
          text: target.textContent,
        },
        timestamp: new Date().getTime(),
        pageInfo: this.getPageInfo(),
      };

      this.metrics.add(metricsName.CBR, { ...metrics });
      delete metrics.pageInfo;

      const behavior: BehaviorStack = {
        name: metricsName.CBR,
        value: metrics,
        ...this.getExtends(),
      };

      this.breadcrumbs.push(behavior);
    };

    window.addEventListener('click', (e) => handler(e), true);
  };

  // 初始化 http 请求的数据获取和上报
  initHttpHandler = (): void => {
    const loadHandler = (metrics: HttpMetrics) => {
      const cpm = { ...metrics };
      if (cpm.status < 400) {
        delete cpm.response;
        delete cpm.body;
      }

      this.metrics.add(metricsName.HT, cpm);
      this.breadcrumbs.push({
        name: metricsName.HT,
        value: cpm,
        ...this.getExtends(),
      });
    };

    proxyFetch(null, loadHandler);
    proxyXmlHttp(null, loadHandler);
  };

  getPageInfo = (): PageInformation => {
    const { host, hostname, href, protocol, origin, port, pathname, search, hash } = window.location;
    const { width, height } = window.screen;
    const { language, userAgent } = navigator;

    return {
      host,
      hostname,
      href,
      protocol,
      origin,
      port,
      pathname,
      search,
      hash,
      title: document.title,
      language: language.substring(0, 2),
      userAgent,
      winScreen: `${width}x${height}`,
      docScreen: `${document.documentElement.clientWidth || document.body.clientWidth}x${
        document.documentElement.clientHeight || document.body.clientHeight
      }`,
    };
  };
}
