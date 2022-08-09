import PerformanceMetricsStore, { metricsName, IMetrics } from '@websrc/core/performanceStore';

export interface PerformanceEntryHandler {
  (entry: any): void;
}

export interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

export interface MPerformanceNavigationTiming {
  FP?: number;
  TTI?: number;
  DomReady?: number;
  Load?: number;
  FirstByte?: number;
  DNS?: number;
  TCP?: number;
  SSL?: number;
  TTFB?: number;
  Trans?: number;
  DomParse?: number;
  Res?: number;
}

export interface ResourceFlowTiming {
  name: string;
  transferSize: number;
  initiatorType: string;
  startTime: number;
  responseEnd: number;
  dnsLookup: number;
  initialConnect: number;
  ssl: number;
  request: number;
  ttfb: number;
  contentDownload: number;
}

export const afterLoad = (callback: any) => {
  if (document.readyState === 'complete') setTimeout(callback);
  else window.addEventListener('pageshow', callback, { once: true, capture: true });
};

export const createObserve = (type: string, callback: PerformanceEntryHandler): PerformanceObserver | undefined => {
  if (PerformanceObserver.supportedEntryTypes.includes(type)) {
    const ob = new PerformanceObserver((l) => l.getEntries().map(callback));

    ob.observe({ type, buffered: true });
    return ob;
  }
  return undefined;
};

export const getFP = (): PerformanceEntry | undefined => {
  const [entry] = performance.getEntriesByName('first-paint');
  return entry;
};

export const getFCP = (): PerformanceEntry | undefined => {
  const [entry] = performance.getEntriesByName('first-contentful-paint');
  return entry;
};

export const getLCP = (entryHandler: PerformanceEntryHandler): PerformanceObserver | undefined => {
  return createObserve('largest-contentful-paint', entryHandler);
};

export const getFID = (entryHandler: PerformanceEntryHandler): PerformanceObserver | undefined => {
  return createObserve('first-input', entryHandler);
};

export const getCLS = (entryHandler: PerformanceEntryHandler): PerformanceObserver | undefined => {
  return createObserve('layout-shift', entryHandler);
};

export const getNavigationTiming = (): MPerformanceNavigationTiming | undefined => {
  const resolveNavigationTiming = (entry: PerformanceNavigationTiming): MPerformanceNavigationTiming => {
    const {
      domainLookupStart,
      domainLookupEnd,
      connectStart,
      connectEnd,
      secureConnectionStart,
      requestStart,
      responseStart,
      responseEnd,
      domInteractive,
      domContentLoadedEventEnd,
      loadEventStart,
      fetchStart,
    } = entry;
    return {
      FP: responseEnd - fetchStart,
      TTI: domInteractive - fetchStart,
      DomReady: domContentLoadedEventEnd - fetchStart,
      FirstByte: responseStart - domainLookupStart,

      DNS: domainLookupEnd - domainLookupStart,
      TCP: connectEnd - connectStart,
      SSL: secureConnectionStart ? connectEnd - secureConnectionStart : 0,
      TTFB: responseStart - requestStart,
      Trans: responseEnd - responseStart,
      DomParse: domInteractive - responseEnd,
      Res: loadEventStart - domContentLoadedEventEnd,
    };
  };
  const navigation =
    performance.getEntriesByType('navigation').length > 0
      ? performance.getEntriesByType('navigation')[0]
      : performance.timing;
  return resolveNavigationTiming(navigation as PerformanceNavigationTiming);
};

export const getResourceTiming = (resourceFlow: Array<ResourceFlowTiming>): PerformanceObserver | undefined => {
  const entryHandler = (entry: PerformanceResourceTiming) => {
    const {
      name,
      transferSize,
      initiatorType,
      startTime,
      responseEnd,
      domainLookupStart,
      domainLookupEnd,
      connectEnd,
      connectStart,
      secureConnectionStart,
      responseStart,
      requestStart,
    } = entry;

    resourceFlow.push({
      // name 资源地址
      name,
      // transferSize 传输大小
      transferSize,
      // initiatorType 资源类型
      initiatorType,
      // startTime 开始时间
      startTime,
      // responseEnd 结束时间
      responseEnd,
      // 贴近 Chrome 的近似分析方案，受到跨域资源影响
      dnsLookup: domainLookupEnd - domainLookupStart,
      initialConnect: connectEnd - connectStart,
      ssl: connectEnd - secureConnectionStart,
      request: responseStart - requestStart,
      ttfb: responseStart - requestStart,
      contentDownload: responseStart - requestStart,
    });
  };

  return createObserve('resource', entryHandler);
};

export default class WebVitals {
  public metrics: PerformanceMetricsStore;

  constructor() {
    this.metrics = new PerformanceMetricsStore();
    this.initLCP();
    this.initCLS();
    this.initResourceFlow();

    afterLoad(() => {
      this.initNavigationTiming();
      this.initFP();
      this.initFCP();
      this.initFID();
      this.perfromanceSendHandler();
    });
  }

  // 性能数据上报
  perfromanceSendHandler = (): void => {
    console.log(this.metrics);
  };

  initFP = (): void => {
    const entry = getFP();
    if (entry) {
      const metrics: IMetrics = {
        startTime: entry?.startTime.toFixed(2),
        entry,
      };

      this.metrics.set(metricsName.FP, metrics);
    }
  };

  initFCP = (): void => {
    const entry = getFCP();
    if (entry) {
      const metrics: IMetrics = {
        startTime: entry?.startTime.toFixed(2),
        entry,
      };

      this.metrics.set(metricsName.FCP, metrics);
    }
  };

  initLCP = (): void => {
    const entryHandler = (entry: PerformanceEntry) => {
      const metric: IMetrics = {
        startTime: entry?.startTime.toFixed(2),
        entry,
      };

      this.metrics.set(metricsName.LCP, metric);
    };

    getLCP(entryHandler);
  };

  initFID = (): void => {
    // const entryHandler = (entry: PerformanceEventTiming) => {
    const entryHandler = (entry: any) => {
      const metrics: IMetrics = {
        delay: entry.processingStart - entry.startTime,
        entry,
      };

      this.metrics.set(metricsName.FID, metrics);
    };
    getFID(entryHandler);
  };

  initCLS = (): void => {
    let clsValue = 0;
    let clsEntries: Array<LayoutShift> = [];

    let sessionValue = 0;
    let sessionEntries: Array<LayoutShift> = [];

    const entryHandler = (entry: LayoutShift) => {
      if (!entry.hadRecentInput) {
        const firstSessionEntry = sessionEntries[0];
        const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

        // 如果条目与上一条目的相隔时间小于 1 秒且
        // 与会话中第一个条目的相隔时间小于 5 秒，那么将条目
        // 包含在当前会话中。否则，开始一个新会话。
        if (
          sessionValue &&
          entry.startTime - lastSessionEntry.startTime < 1000 &&
          entry.startTime - firstSessionEntry.startTime < 5000
        ) {
          sessionValue += entry.value;
          sessionEntries.push(entry);
        } else {
          sessionValue = entry.value;
          sessionEntries = [entry];
        }

        if (sessionValue > clsValue) {
          clsValue = sessionValue;
          clsEntries = sessionEntries;
          const metric: IMetrics = {
            entry,
            clsValue,
            clsEntries,
          };
          this.metrics.set(metricsName.CLS, metric);
        }
      }
    };

    getCLS(entryHandler);
  };

  initNavigationTiming = (): void => {
    const navigationTiming = getNavigationTiming();
    const metrics = navigationTiming as IMetrics;
    this.metrics.set(metricsName.NT, metrics);
  };

  initResourceFlow = (): void => {
    const resourceFlow: Array<ResourceFlowTiming> = [];
    const resObserver = getResourceTiming(resourceFlow);

    const stopListening = () => {
      if (resObserver) resObserver.disconnect();
      const metrics = resourceFlow as IMetrics;
      this.metrics.set(metricsName.RF, metrics);
    };

    window.addEventListener('pageshow', stopListening, { once: true, capture: true });
  };
}
