// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------

// dashboard is the package for the backend API of the Radius dashboard.
//
// DO NOT reference this package in other parts of the Radius codebase.
//
// This package provides the functionality for:
//
// - Serving static files (the frontend app).
//
// - Serving APIs used by the frontend app.
//
// We use an additional API (this package) to avoid the need for Kubernetes
// auth and other complicated concerns in the browser. This is also called the
// BFF pattern: https://samnewman.io/patterns/architectural/bff/
package dashboard
