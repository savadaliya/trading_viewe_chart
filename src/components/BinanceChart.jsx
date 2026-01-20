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
const EXCHANGE = "Binance";

const INTERVALS = {
  Seconds: ["1s"],
  Minutes: ["1m", "3m", "5m", "15m", "30m"],
  Hours: ["1h", "2h", "4h", "6h", "8h", "12h"],
  Days: ["1d", "3d"],
  Weeks: ["1w"],
  Months: ["1M"],
};

const INTERVAL_DURATION = {
  "1s": 1, "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "8h": 28800, "12h": 43200,
  "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000,
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
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);

  const [topBar, setTopBar] = useState({
    open: null, high: null, low: null, close: null, change: null, percent: null, isUp: true,
  });

  const formatRemaining = (ms) => {
    if (ms <= 0) return "00:00";
    const t = Math.floor(ms / 1000);
    const m = String(Math.floor(t / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const fetchHistory = async () => {
    // 1s interval is not supported for historical data via Binance klines API
    if (interval === "1s") return [];

    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${interval}&limit=500`
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
    } catch (err) {
      console.error("Fetch error:", err);
      return [];
    }
  };

  const applyRightSpace = () => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().scrollToRealTime();
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      timeScale.setVisibleLogicalRange({ from: range.from, to: range.to + 20 });
    }
  };

  const createSeries = (data) => {
    if (!chartRef.current) return;
    if (seriesRef.current) chartRef.current.removeSeries(seriesRef.current);

    const baseOpts = { lastValueVisible: true, priceLineVisible: false };

    if (chartType === "line") {
      seriesRef.current = chartRef.current.addSeries(LineSeries, { ...baseOpts, color: "#4cafef" });
    } else if (chartType === "area") {
      seriesRef.current = chartRef.current.addSeries(AreaSeries, { ...baseOpts, lineColor: "#4cafef", topColor: "rgba(76,175,239,0.4)", bottomColor: "rgba(76,175,239,0)" });
    } else if (chartType === "bar") {
      seriesRef.current = chartRef.current.addSeries(BarSeries, { ...baseOpts, upColor: "#26a69a", downColor: "#ef5350" });
    } else {
      seriesRef.current = chartRef.current.addSeries(CandlestickSeries, { ...baseOpts, upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderUpColor: "#26a69a", borderDownColor: "#ef5350" });
    }

    if (data && data.length > 0) {
      seriesRef.current.setData(data);
    }

    // Smooth scrolling to data
    requestAnimationFrame(() => {
      applyRightSpace();
    });
  };

  const connectWS = () => {
    wsRef.current?.close();
    wsRef.current = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL.toLowerCase()}@kline_${interval}`);

    wsRef.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const k = data.k;
      const open = +k.o; const close = +k.c; const high = +k.h; const low = +k.l;
      const change = close - open;
      const percent = open ? (change / open) * 100 : 0;
      const isUp = close >= open;

      setTopBar({ open, high, low, close, change, percent, isUp });

      if (seriesRef.current) {
        seriesRef.current.update({ time: k.t / 1000, open, high, low, close, value: close });
      }

      const duration = INTERVAL_DURATION[interval];
      const remainingMs = Math.max(0, k.t + duration * 1000 - data.E);

      if (priceLineRef.current) seriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: close,
        color: isUp ? "#26a69a" : "#ef5350",
        axisLabelVisible: true,
        title: `${close.toFixed(2)} | ${formatRemaining(remainingMs)}`,
      });
    };
  };

  useEffect(() => {
    chartRef.current = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#131722" }, textColor: "#d1d4dc" },
      grid: { vertLines: { color: "#1f2943" }, horzLines: { color: "#1f2943" } },
      timeScale: { timeVisible: true, secondsVisible: interval === "1s", rightOffset: 12 },
    });

    const handleResize = () => chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      wsRef.current?.close();
      chartRef.current.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await fetchHistory();
      if (!active) return;
      createSeries(data);
      connectWS();
    })();
    return () => { active = false; wsRef.current?.close(); };
  }, [interval]);

  useEffect(() => {
    if (history.length) createSeries(history);
  }, [chartType]);

  return (
    <div className="chart-wrapper">
      <div ref={containerRef} className="chart-container" />
      <div className="top-trade-bar">
        <div className="pair">BTCUSDT · {interval} · {EXCHANGE}</div>
        <div className="ohlc">
          O <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.open?.toFixed(2)}</span>
          H <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.high?.toFixed(2)}</span>
          L <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.low?.toFixed(2)}</span>
          C <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.close?.toFixed(2)}</span>
        </div>
      </div>

      <div className="toolbar left">
        <div className="chart-types">
          <button className={chartType === "candlestick" ? "active" : ""} onClick={() => setChartType("candlestick")}>C</button>
          <button className={chartType === "line" ? "active" : ""} onClick={() => setChartType("line")}>L</button>
          <button className={chartType === "area" ? "active" : ""} onClick={() => setChartType("area")}>A</button>
          <button className={chartType === "bar" ? "active" : ""} onClick={() => setChartType("bar")}>B</button>
        </div>

        <div className="interval-wrapper" style={{ position: 'relative', marginLeft: '5px', borderLeft: '1px solid #363c4e', paddingLeft: '5px' }}>
          <button className="dropdown-btn" onClick={() => setShowIntervalMenu((p) => !p)}>
            ⏱ {interval}
          </button>
          {showIntervalMenu && (
            <div className="dropdown-menu-left">
              {Object.entries(INTERVALS).map(([group, values]) => (
                <div key={group} className="interval-section">
                  <div className="group-title">{group}</div>
                  <div className="group-items">
                    {values.map((v) => (
                      <button key={v} className={interval === v ? "active" : ""} onClick={() => { setInterval(v); setShowIntervalMenu(false); }}>{v}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}