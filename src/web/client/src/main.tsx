import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // 暂时移除 StrictMode 以避免开发环境 WebSocket 双重连接问题
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);
