import React from "react";
import ReactDOM from "react-dom/client";
// 基础样式必须先于组件样式导入，否则组件的覆盖规则会在打包时排到 index.css 前面而被覆盖掉
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
