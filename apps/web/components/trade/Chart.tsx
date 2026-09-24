"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "@/lib/api";
import { useMarket } from "@/context/MarketContext";
import { wsClient } from "@/lib/ws";
import { centerLoader, cx, panel, panelTitle, spinner, tradePanelHeight } from "@/lib/ui";

const INTERVALS = [
  { label: "1s", value: "1s", ms: 1_000 },
  { label: "5s", value: "5s", ms: 5_000 },
  { label: "1m", value: "1m", ms: 60_000 },
  { label: "5m", value: "5m", ms: 5 * 60_000 },
  { label: "10m", value: "10m", ms: 10 * 60_000 },
  { label: "30m", value: "30m", ms: 30 * 60_000 },
  { label: "1h", value: "1h", ms: 60 * 60_000 },
  { label: "1d", value: "1d", ms: 24 * 60 * 60_000 },
] as const;

type Interval = (typeof INTERVALS)[number]["value"];

interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatChartTime(time: unknown, includeSeconds: boolean): string {
  let d: Date;
  if (typeof time === "number") {
    d = new Date(time * 1000); 
  } else if (time && typeof time === "object") {
    const bd = time as { year: number; month: number; day: number };
    d = new Date(Date.UTC(bd.year, bd.month - 1, bd.day));
  } else {
    return String(time);
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  });
}

export function Chart() {
  const { selected } = useMarket();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [interval, setCandleInterval] = useState<Interval>("1m");
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<Interval>("1m");

  const symbol = selected?.symbol;

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9aa0ae",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(34,37,47,0.6)" },
        horzLines: { color: "rgba(34,37,47,0.6)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3a4050", labelBackgroundColor: "#22252f" },
        horzLine: { color: "#3a4050", labelBackgroundColor: "#22252f" },
      },
      rightPriceScale: {
        borderColor: "#22252f",
      },
      timeScale: {
        borderColor: "#22252f",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        timeFormatter: (t: Time) => formatChartTime(t, intervalRef.current.endsWith("s")),
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c087",
      downColor: "#ec4545",
      borderUpColor: "#00c087",
      borderDownColor: "#ec4545",
      wickUpColor: "#00c087",
      wickDownColor: "#ec4545",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    // On mount, hard-reset any corrupted interval state left over by HMR.
    if (typeof interval !== "string" || !INTERVALS.some((iv) => iv.value === interval)) {
      setCandleInterval("1m");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // When using sub-minute candles, show seconds on the x-axis.
    if (typeof interval !== "string") return;
    intervalRef.current = interval;
    chartRef.current?.applyOptions({
      timeScale: {
        secondsVisible: interval.endsWith("s"),
      },
    });
  }, [interval]);

  useEffect(() => {
    if (!symbol) return;

    // Defensive: if a previous HMR build accidentally set `interval` to a Promise
    // (via shadowing `setInterval`), reset it.
    if (!INTERVALS.some((iv) => iv.value === interval)) {
      setCandleInterval("1m");
      return;
    }

    setLoading(true);

    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const iv = typeof interval === "string" && INTERVALS.some((i) => i.value === interval) ? interval : "1m";
        const res = await api.candles(symbol, iv, 300);
        if (cancelled) return;
        const candles = (res.candles || []).map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const volumes = (res.candles || []).map((c) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.volume,
          color:
            c.close >= c.open
              ? "rgba(0,192,135,0.4)"
              : "rgba(236,69,69,0.4)",
        }));

        candleSeriesRef.current?.setData(candles);
        volumeSeriesRef.current?.setData(volumes);
        chartRef.current?.timeScale().fitContent();
      } catch (e) {
        console.error("Chart candles load failed", { symbol, intervalType: typeof interval, interval, e });
        candleSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // WS candles are not wired yet; poll to keep the chart fresh.
    const t = window.setInterval(() => {
      void load();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [symbol, interval]);

  useEffect(() => {
    if (!symbol) return;

    const channel = `candles.${symbol}`;
    const unsubscribe = wsClient.subscribe(channel, (data) => {
      const d = (data ?? {}) as Record<string, unknown>;
      if (!d.time) return;
      const t = Math.floor(Number(d.time) / 1000) as UTCTimestamp;
      const close = Number(d.close ?? 0);
      const open = Number(d.open ?? close);
      const candle: Candle = {
        time: t,
        open,
        high: Number(d.high ?? close),
        low: Number(d.low ?? close),
        close,
        volume: Number(d.volume ?? 0),
      };
      candleSeriesRef.current?.update(candle);
      volumeSeriesRef.current?.update({
        time: t,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(0,192,135,0.4)" : "rgba(236,69,69,0.4)",
      });
    });

    return unsubscribe;
  }, [symbol]);

  return (
    <div className={cx(panel, tradePanelHeight, "flex flex-col")}>
      <div className="flex items-center gap-1 border-b border-border px-3 py-[9px]">
        <span className={panelTitle}>Chart</span>
        <div className="ml-auto flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              className={cx(
                "cursor-pointer rounded-[7px] border-none bg-none px-[11px] py-1.5 text-[13.5px] font-semibold text-text-dim hover:text-text",
                interval === iv.value && "bg-accent-bg text-accent",
              )}
              onClick={() => setCandleInterval(iv.value)}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 w-full flex-1">
        {loading && (
          <div className={cx(centerLoader, "absolute inset-0 bg-panel")}>
            <span className={spinner} />
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
