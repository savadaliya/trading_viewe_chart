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
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);

  const [topBar, setTopBar] = useState({
    open: null,
    high: null,
    low: null,
    close: null,
    change: null,
    percent: null,
    isUp: true,
  });

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

  const applyRightSpace = () => {
    if (!chartRef.current) return;

    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (!range) return;

    timeScale.setVisibleLogicalRange({
      from: range.from,
      to: range.to + 35,
    });
  };

  const createSeries = (data) => {
    if (!chartRef.current) return;
    if (seriesRef.current) chartRef.current.removeSeries(seriesRef.current);

    const baseOpts = { lastValueVisible: false, priceLineVisible: false };

    if (chartType === "line") {
      seriesRef.current = chartRef.current.addSeries(LineSeries, {
        ...baseOpts,
        color: "#4cafef",
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

    requestAnimationFrame(() => {
      applyRightSpace();
    });
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

      const change = close - open;
      const percent = open ? (change / open) * 100 : 0;
      const isUp = close >= open;

      setTopBar({ open, high, low, close, change, percent, isUp });

      seriesRef.current.update({
        time: k.t / 1000,
        open,
        high,
        low,
        close,
        value: close,
      });

      const duration = INTERVAL_DURATION[interval];
      const remainingMs = Math.max(0, k.t + duration * 1000 - data.E);

      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }

      priceLineRef.current = seriesRef.current.createPriceLine({
        price: close,
        color: isUp ? "#26a69a" : "#ef5350",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "",
      });

      updateCustomAxisLabel(close, formatRemaining(remainingMs), isUp ? "#26a69a" : "#ef5350");
    };
  };

  const updateCustomAxisLabel = (price, time, color) => {
    let el = document.getElementById('custom-axis-label');
    if (!el) {
      el = document.createElement('div');
      el.id = 'custom-axis-label';
      document.querySelector('.tv-lightweight-charts').appendChild(el);
    }

    const coordinate = seriesRef.current.priceToCoordinate(price);

    if (coordinate !== null) {
      el.style.display = 'flex';
      el.style.top = `${coordinate - 20}px`;
      el.style.backgroundColor = color;
      el.innerHTML = `
            <div style="font-size: 13px; font-weight: bold;">${price.toFixed(2)}</div>
            <div style="font-size: 11px; margin-top: -2px;">${time}</div>
        `;
    }
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
      timeScale: {
        timeVisible: true,
        secondsVisible: interval === "1s",

        rightBarStaysOnScroll: true,
        fixLeftEdge: true,
        fixRightEdge: false,

        tickMarkFormatter: (time, tickMarkType, locale) => {
          const date = new Date(time * 1000);

          if (interval === "1s") {
            return date.toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
          }

          if (interval.includes("m")) {
            return date.toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            });
          }

          if (interval.includes("h")) {
            return date.toLocaleString(locale, {
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          }

          return date.toLocaleDateString(locale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
        },
      },

    });

    return () => {
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

    return () => {
      active = false;
      wsRef.current?.close();
    };
  }, [interval]);

  useEffect(() => {
    if (history.length) createSeries(history);
  }, [chartType]);

  return (
    <div className="chart-wrapper">
      <div ref={containerRef} className="chart-container" />

      <div className="top-trade-bar">
        <div className="pair">
          Bitcoin / TetherUS · {interval} · {EXCHANGE}
        </div>

        <div className="ohlc">
          O <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.open?.toFixed(2)}</span>
          H <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.high?.toFixed(2)}</span>
          L <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.low?.toFixed(2)}</span>
          C <span style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>{topBar.close?.toFixed(2)}</span>
        </div>

        <div className="perf" style={{ color: topBar.isUp ? "#26a69a" : "#ef5350" }}>
          {topBar.change?.toFixed(2)} ({topBar.percent?.toFixed(2)}%)
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
