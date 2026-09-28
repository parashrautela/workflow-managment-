import React from "react";
import ReactDOM from "react-dom/client";
import FounderApp from "./FounderApp";
import ClientApp from "./ClientApp";
import EmployeeApp from "./EmployeeApp";
import "./index.css";

const rootElement = document.getElementById("app");
if (rootElement) {
  const isClientView = window.location.pathname.startsWith("/c/");
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {isClientView ? <ClientApp /> : window.location.pathname.startsWith("/employee") ? <EmployeeApp /> : <FounderApp />}
    </React.StrictMode>
  );
}
