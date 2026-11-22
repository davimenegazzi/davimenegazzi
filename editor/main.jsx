import { createRoot } from "react-dom/client";
import "../js/store.js"; // mesma camada de dados do site (API na Vercel ou localStorage)
import "./editor.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
