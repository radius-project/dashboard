import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './app/store';
import { ErrorBoundary } from 'react-error-boundary'
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import reportWebVitals from './reportWebVitals';
import { ErrorFallback } from './Error';
import './index.css';
import Root from "./routes/Root";
import ErrorPage from './NotFound';
import IndexPage from './routes/Index';
import ApplicationPage from './routes/Applications';
import EnvironmentPage from './routes/Environments';
import ContainerPage from './routes/Containers';
import ResourcePage from './routes/Resources';

const container = document.getElementById('root')!;
const root = createRoot(container);

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <IndexPage />
      },
      {
        path: "environments",
        element: <EnvironmentPage />
      },
      {
        path: "applications",
        element: <ApplicationPage />
      },
      {
        path: "containers",
        element: <ContainerPage />
      },
      {
        path: "resources",
        element: <ResourcePage />
      }
    ]
  },
]);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </Provider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
