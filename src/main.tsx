import React from "react";
import ReactDOM from "react-dom/client";
// 样式导入顺序在这里统一定义，不要在组件里分散 import —— 顺序错了会被静默覆盖。
// 顺序：变量 → 基础 → 通用组件 → 外壳 → 计时器 → 编辑型页面 → 账号 → 首页 → 控制台 → 房间
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/timer.css";
import "./styles/editorial.css";
import "./styles/account.css";
import "./styles/landing.css";
import "./styles/console.css";
import "./styles/room.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
