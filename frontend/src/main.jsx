import React from 'react';
import ReactDOM from 'react-dom/client';
import FounderApp from './apps/FounderApp';
import ClientApp from './apps/ClientApp';
import EmployeeApp from './apps/EmployeeApp';
import './styles/index.css';
import './styles/iksha.css';
import './styles/controls.css';
import './styles/unslop-home.css';

const rootElement = document.getElementById('app');
if (rootElement) {
  const isClientView = window.location.pathname.startsWith('/c/');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {isClientView ? (
        <ClientApp />
      ) : window.location.pathname.startsWith('/employee') ? (
        <EmployeeApp />
      ) : (
        <FounderApp />
      )}
    </React.StrictMode>,
  );
}
