// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------

package dashboard

import (
	"context"
	"fmt"
	"net"
	"net/http"

	"github.com/go-logr/logr"
	"github.com/gorilla/mux"
	v1 "github.com/project-radius/radius/pkg/armrpc/api/v1"
	"github.com/project-radius/radius/pkg/armrpc/rest"
	"github.com/project-radius/radius/pkg/ucp/hosting"
	k8srest "k8s.io/client-go/rest"
)

var _ hosting.Service = (*Service)(nil)

type Service struct {
	Address    string
	RestConfig *k8srest.Config
}

// Name implements hosting.Service
func (s *Service) Name() string {
	return "webserver"
}

// Run implements hosting.Service
func (s *Service) Run(ctx context.Context) error {
	logger := logr.FromContextOrDiscard(ctx)

	service, err := s.Initialize(ctx)
	if err != nil {
		return err
	}

	// Handle shutdown based on the context
	go func() {
		<-ctx.Done()
		// We don't care about shutdown errors
		_ = service.Shutdown(ctx)
	}()

	logger.Info(fmt.Sprintf("listening on: '%s'...", s.Address))
	err = service.ListenAndServe()
	if err == http.ErrServerClosed {
		// We expect this, safe to ignore.
		logger.Info("Server stopped...")
		return nil
	} else if err != nil {
		return err
	}

	logger.Info("Server stopped...")
	return nil
}

func (s *Service) Initialize(ctx context.Context) (*http.Server, error) {
	r := mux.NewRouter()

	api := &API{RestConfig: s.RestConfig}
	r.Path("/api/resources").Methods("GET").HandlerFunc(wrapHandler(api.ListResourcesAtPlaneScope))

	app := http.Handler(r)

	server := &http.Server{
		Addr:    s.Address,
		Handler: app,
		BaseContext: func(ln net.Listener) context.Context {
			return ctx
		},
	}
	return server, nil
}

func wrapHandler(inner func(r *http.Request) (rest.Response, error)) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := logr.FromContextOrDiscard(r.Context())

		response, err := inner(r)
		if err != nil {
			logger.Error(err, "unhandled error")
			response = rest.NewInternalServerErrorARMResponse(v1.ErrorResponse{
				Error: v1.ErrorDetails{
					Code:    v1.CodeInternal,
					Message: fmt.Sprintf("unexpected error: %v", err),
				},
			})
		}

		if response == nil {
			return
		}

		err = response.Apply(r.Context(), w, r)
		if err != nil {
			logger.Error(err, "error writing output")

			// There's no way to recover if we fail writing here, we likly partially wrote to the response stream.
			w.WriteHeader(http.StatusInternalServerError)
		}
	}
}
