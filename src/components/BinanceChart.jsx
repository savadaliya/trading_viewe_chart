import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  ColorType,
} from "lightweight-charts";

const SYMBOL = "BTCUSDT";

const INTERVALS = {
  Seconds: ["1s"],
  Minutes: ["1m", "3m", "5m", "15m", "30m"],
  Hours: ["1h", "2h", "4h", "6h", "8h", "12h"],
  Days: ["1d", "3d"],
  Weeks: ["1w"],
  Months: ["1M"],
};

const INTERVAL_DURATION = {
  "1s": 1,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "8h": 28800,
  "12h": 43200,
  "1d": 86400,
  "3d": 259200,
  "1w": 604800,
  "1M": 2592000,
};

export default function BinanceChart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const wsRef = useRef(null);
  const priceLineRef = useRef(null);

  const [interval, setInterval] = useState("1m");
  const [chartType, setChartType] = useState("candlestick");
  const [history, setHistory] = useState([]);

  const formatRemaining = (ms) => {
    if (ms <= 0) return "00:00";
    const t = Math.floor(ms / 1000);
    const m = String(Math.floor(t / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const fetchHistory = async () => {
    if (interval === "1s") return history;
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${interval}&limit=300`
    );
    const data = await res.json();
    const formatted = data.map((k) => ({
      time: k[0] / 1000,
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      value: +k[4],
    }));
    setHistory(formatted);
    return formatted;
  };

  const createSeries = (data) => {
    if (!chartRef.current) return;
    if (seriesRef.current) chartRef.current.removeSeries(seriesRef.current);

    const baseOpts = {
      lastValueVisible: false,
      priceLineVisible: false,
    };

    if (chartType === "line") {
      seriesRef.current = chartRef.current.addSeries(LineSeries, {
        ...baseOpts,
        color: "#4cafef",
        lineWidth: 2,
      });
    } else if (chartType === "area") {
      seriesRef.current = chartRef.current.addSeries(AreaSeries, {
        ...baseOpts,
        lineColor: "#4cafef",
        topColor: "rgba(76,175,239,0.4)",
        bottomColor: "rgba(76,175,239,0)",
      });
    } else if (chartType === "bar") {
      seriesRef.current = chartRef.current.addSeries(BarSeries, {
        ...baseOpts,
        upColor: "#26a69a",
        downColor: "#ef5350",
      });
    } else {
      seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        ...baseOpts,
        upColor: "#26a69a",
        downColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
      });
    }

    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  };

  const connectWS = () => {
    wsRef.current?.close();

    wsRef.current = new WebSocket(
      `wss://stream.binance.com:9443/ws/${SYMBOL.toLowerCase()}@kline_${interval}`
    );

    wsRef.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const k = data.k;

      const open = +k.o;
      const close = +k.c;
      const high = +k.h;
      const low = +k.l;

      const isUp = close >= open;
      const color = isUp ? "#26a69a" : "#ef5350";

      if (chartType === "line" || chartType === "area") {
        seriesRef.current.update({
          time: k.t / 1000,
          value: close,
        });
      } else if (chartType === "bar") {
        seriesRef.current.update({
          time: k.t / 1000,
          open,
          high,
          low,
          close,
          color,
        });
      } else {
        seriesRef.current.update({
          time: k.t / 1000,
          open,
          high,
          low,
          close,
          color,
          borderColor: color,
          wickColor: color,
        });
      }

      const duration = INTERVAL_DURATION[interval];
      const remainingMs = Math.max(0, k.t + duration * 1000 - data.E);
      const timeText = formatRemaining(remainingMs);

      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }

      priceLineRef.current = seriesRef.current.createPriceLine({
        price: close,
        color,
        lineWidth: 2,
        axisLabelVisible: true,
        title: `${close.toFixed(2)} | ${timeText}`,
      });
    };
  };

  useEffect(() => {
    chartRef.current = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1f2943" },
        horzLines: { color: "#1f2943" },
      },
      timeScale: { timeVisible: true, secondsVisible: true },
    });

    const resize = () => {
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };

    window.addEventListener("resize", resize);
    resize();

    return () => {
      window.removeEventListener("resize", resize);
      wsRef.current?.close();
      chartRef.current.remove();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const data = await fetchHistory();
      createSeries(data);
      connectWS();
    })();
  }, [interval]);

  useEffect(() => {
    if (history.length) createSeries(history);
  }, [chartType]);

  return (
    <div className="chart-wrapper">
      <div ref={containerRef} className="chart-container" />

      <div className="toolbar left">
        <button onClick={() => setChartType("candlestick")}>C</button>
        <button onClick={() => setChartType("line")}>L</button>
        <button onClick={() => setChartType("area")}>A</button>
        <button onClick={() => setChartType("bar")}>B</button>
      </div>

      <div className="toolbar right">
        {Object.values(INTERVALS).flat().map((v) => (
          <button
            key={v}
            className={interval === v ? "active" : ""}
            onClick={() => setInterval(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
