import React from "react";
import ReactDOM from "react-dom/client";
// 样式导入顺序在这里统一定义，不要在组件里分散 import —— 顺序错了会被静默覆盖。
// 迁移期说明：index.css 是旧样式，正在逐页替换，全部迁完就删掉；
// styles/* 是新的 Design System（tokens -> base -> components -> 各页面）。
import "./index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/timer.css";
import "./styles/editorial.css";
import "./styles/account.css";
import "./styles/landing.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
